//! Zenoh DataFabric adapter (real Eclipse Zenoh sessions).

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::broadcast;

use super::super::action::{
    ActionFeedbackFrame, PickAndPlaceFeedback, PickAndPlaceGoal, ACTION_FEEDBACK_TOPIC,
    ACTION_FEEDBACK_WILDCARD_TOPIC, ACTION_GOAL_TOPIC, ROS2_ACTION_GOAL_TOPIC,
};
use super::super::domain::robot_telemetry_topic;
use super::error::FabricError;
use super::subscriptions::{ActionFeedbackSubscription, TelemetrySubscription};

const CHANNEL_CAPACITY: usize = 512;

#[derive(Debug)]
struct ZenohStreamEntry {
    sender: broadcast::Sender<String>,
    sub_count: usize,
    worker_handle: tokio::task::JoinHandle<()>,
}

#[derive(Debug)]
struct ActionFeedbackStreamEntry {
    sender: broadcast::Sender<ActionFeedbackFrame>,
    sub_count: usize,
    worker_handle: tokio::task::JoinHandle<()>,
}

/// Zenoh DataFabric adapter interfacing with real Eclipse Zenoh sessions.
#[derive(Debug, Clone)]
pub struct ZenohFabric {
    pub(super) session: Arc<zenoh::Session>,
    streams: Arc<Mutex<HashMap<String, ZenohStreamEntry>>>,
    feedback_streams: Arc<Mutex<HashMap<String, ActionFeedbackStreamEntry>>>,
}

impl ZenohFabric {
    /// Creates a new `ZenohFabric` around an active Zenoh session.
    pub fn new(session: zenoh::Session) -> Self {
        Self {
            session: Arc::new(session),
            streams: Arc::new(Mutex::new(HashMap::new())),
            feedback_streams: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Returns the number of active telemetry subscriptions for `robot_id`.
    ///
    /// # Panics
    /// Panics if internal mutex is poisoned.
    pub fn active_telemetry_subscriptions(&self, robot_id: &str) -> usize {
        let streams = self
            .streams
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        streams.get(robot_id).map_or(0, |entry| entry.sub_count)
    }

    /// Subscribes to telemetry on Zenoh with asynchronous multiplexing and clean worker teardown on drop.
    ///
    /// # Errors
    /// Returns [`FabricError`] on invalid robot ID.
    ///
    /// # Panics
    /// Panics if internal mutex is poisoned.
    pub fn subscribe_telemetry(
        &self,
        robot_id: &str,
    ) -> Result<TelemetrySubscription, FabricError> {
        let topic = robot_telemetry_topic(robot_id)?;
        let mut streams = self
            .streams
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);

        let rx = match streams.entry(robot_id.to_string()) {
            std::collections::hash_map::Entry::Occupied(mut occ) => {
                let entry = occ.get_mut();
                if entry.worker_handle.is_finished() {
                    let (new_tx, new_rx) = broadcast::channel(CHANNEL_CAPACITY);
                    let session = Arc::clone(&self.session);
                    let tx_forward = new_tx.clone();
                    let topic_clone = topic;
                    let handle = tokio::spawn(async move {
                        match session.declare_subscriber(&topic_clone).await {
                            Ok(subscriber) => {
                                log::info!("Declared Zenoh subscriber for {topic_clone}");
                                while let Ok(sample) = subscriber.recv_async().await {
                                    let payload_str =
                                        String::from_utf8_lossy(&sample.payload().to_bytes())
                                            .into_owned();
                                    let _ = tx_forward.send(payload_str);
                                }
                            }
                            Err(err) => {
                                log::error!(
                                    "Failed to declare Zenoh subscriber on {topic_clone}: {err}"
                                );
                            }
                        }
                    });
                    entry.sender = new_tx;
                    entry.worker_handle = handle;
                    entry.sub_count = 1;
                    new_rx
                } else {
                    entry.sub_count += 1;
                    entry.sender.subscribe()
                }
            }
            std::collections::hash_map::Entry::Vacant(vac) => {
                let (new_tx, new_rx) = broadcast::channel(CHANNEL_CAPACITY);
                let session = Arc::clone(&self.session);
                let tx_forward = new_tx.clone();
                let topic_clone = topic;
                let handle = tokio::spawn(async move {
                    match session.declare_subscriber(&topic_clone).await {
                        Ok(subscriber) => {
                            log::info!("Declared Zenoh subscriber for {topic_clone}");
                            while let Ok(sample) = subscriber.recv_async().await {
                                let payload_str =
                                    String::from_utf8_lossy(&sample.payload().to_bytes())
                                        .into_owned();
                                let _ = tx_forward.send(payload_str);
                            }
                        }
                        Err(err) => {
                            log::error!(
                                "Failed to declare Zenoh subscriber on {topic_clone}: {err}"
                            );
                        }
                    }
                });
                vac.insert(ZenohStreamEntry {
                    sender: new_tx,
                    sub_count: 1,
                    worker_handle: handle,
                });
                new_rx
            }
        };
        drop(streams);

        let r_id = robot_id.to_string();
        let streams_map = Arc::clone(&self.streams);

        let guard = Box::new(move || {
            let mut streams = streams_map
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            if let std::collections::hash_map::Entry::Occupied(mut occ) =
                streams.entry(r_id.clone())
            {
                let entry = occ.get_mut();
                entry.sub_count = entry.sub_count.saturating_sub(1);
                if entry.sub_count == 0 {
                    let removed = occ.remove();
                    removed.worker_handle.abort();
                    log::info!("Torn down Zenoh streaming worker for robot {r_id}");
                }
            }
        });

        Ok(TelemetrySubscription {
            receiver: rx,
            drop_guard: Some(guard),
        })
    }

    /// Returns a clone of the inner Zenoh session reference.
    #[must_use]
    pub fn session(&self) -> Arc<zenoh::Session> {
        Arc::clone(&self.session)
    }

    /// Publishes a raw telemetry JSON string to `robot/{robot_id}/telemetry` over Zenoh asynchronously.
    ///
    /// # Errors
    /// Returns [`FabricError`] on invalid robot ID or Zenoh put failure.
    pub async fn publish_telemetry_async(
        &self,
        robot_id: &str,
        telemetry_json: &str,
    ) -> Result<(), FabricError> {
        let topic = robot_telemetry_topic(robot_id)?;
        self.session
            .put(&topic, telemetry_json)
            .await
            .map_err(|e| FabricError::Zenoh(e.to_string()))?;
        Ok(())
    }

    /// Publishes a raw telemetry JSON string to `robot/{robot_id}/telemetry` over Zenoh in a background task.
    ///
    /// # Errors
    /// Returns [`FabricError`] on invalid robot ID.
    pub fn publish_telemetry(
        &self,
        robot_id: &str,
        telemetry_json: &str,
    ) -> Result<(), FabricError> {
        let topic = robot_telemetry_topic(robot_id)?;
        let session = Arc::clone(&self.session);
        let payload = telemetry_json.to_string();
        tokio::spawn(async move {
            if let Err(e) = session.put(&topic, payload).await {
                log::error!("Failed to publish telemetry to Zenoh on {topic}: {e}");
            }
        });
        Ok(())
    }

    /// Publishes a PickAndPlace action goal over Zenoh.
    ///
    /// # Errors
    /// Returns [`FabricError`] on serialization or Zenoh put failure.
    pub async fn publish_action_goal(
        &self,
        robot_id: &str,
        goal: &PickAndPlaceGoal,
    ) -> Result<(), FabricError> {
        // Bind goal to command_id: dual-publish stays (ROS2 bridge compat) but the
        // edge must ignore goals whose command_id it did not originate.
        let mut goal = goal.clone();
        goal.command_id = format!("{robot_id}/{}", goal.command_id);
        let json_payload = serde_json::to_string(&goal)?;
        // Ownership bound via "{robot_id}/{command_id}" prefix above; no edge
        // subscriber consumes this topic today; future consumer must verify
        // prefix before dispatch (prevents cross-robot goal steal).
        let res1 = self
            .session
            .put(ACTION_GOAL_TOPIC, json_payload.clone())
            .await;
        let _ = self.session.put(ROS2_ACTION_GOAL_TOPIC, json_payload).await;
        res1.map_err(|e| FabricError::Zenoh(e.to_string()))?;
        log::info!("Published PickAndPlace goal to Zenoh on {ACTION_GOAL_TOPIC}");
        Ok(())
    }

    /// Publishes Action feedback over Zenoh.
    ///
    /// # Errors
    /// Returns [`FabricError`] on serialization or Zenoh put failure.
    pub async fn publish_action_feedback(
        &self,
        _robot_id: &str,
        feedback: &ActionFeedbackFrame,
    ) -> Result<(), FabricError> {
        let json_payload = serde_json::to_string(feedback)?;
        self.session
            .put(ACTION_FEEDBACK_TOPIC, json_payload)
            .await
            .map_err(|e| FabricError::Zenoh(e.to_string()))?;
        log::info!("Published Action feedback to Zenoh on {ACTION_FEEDBACK_TOPIC}");
        Ok(())
    }

    /// Subscribes to Action feedback on Zenoh with multiplexing and clean worker teardown on drop.
    ///
    /// # Errors
    /// Returns [`FabricError`] if subscription setup fails.
    ///
    /// # Panics
    /// Panics if internal mutex is poisoned.
    #[allow(clippy::too_many_lines)]
    pub fn subscribe_action_feedback(
        &self,
        robot_id: &str,
    ) -> Result<ActionFeedbackSubscription, FabricError> {
        let mut streams = self
            .feedback_streams
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);

        let rx = match streams.entry(robot_id.to_string()) {
            std::collections::hash_map::Entry::Occupied(mut occ) => {
                let entry = occ.get_mut();
                if entry.worker_handle.is_finished() {
                    let (new_tx, new_rx) = broadcast::channel(CHANNEL_CAPACITY);
                    let session = Arc::clone(&self.session);
                    let tx_forward = new_tx.clone();
                    let handle = tokio::spawn(async move {
                        match session
                            .declare_subscriber(ACTION_FEEDBACK_WILDCARD_TOPIC)
                            .await
                        {
                            Ok(subscriber) => {
                                log::info!("Declared Zenoh subscriber for action feedback on {ACTION_FEEDBACK_WILDCARD_TOPIC}");
                                while let Ok(sample) = subscriber.recv_async().await {
                                    let payload_bytes = sample.payload().to_bytes();
                                    let payload_str = String::from_utf8_lossy(&payload_bytes);
                                    if let Ok(frame) =
                                        serde_json::from_str::<ActionFeedbackFrame>(&payload_str)
                                    {
                                        let _ = tx_forward.send(frame);
                                    } else if let Ok(fb) =
                                        serde_json::from_str::<PickAndPlaceFeedback>(&payload_str)
                                    {
                                        let now_ns = std::time::SystemTime::now()
                                            .duration_since(std::time::UNIX_EPOCH)
                                            .map_or(0, |d| {
                                                u64::try_from(d.as_nanos()).unwrap_or(u64::MAX)
                                            });
                                        let frame = ActionFeedbackFrame::new(
                                            "arm_controller",
                                            fb.phase,
                                            fb.percent_complete,
                                            now_ns,
                                        );
                                        let _ = tx_forward.send(frame);
                                    }
                                }
                            }
                            Err(err) => {
                                log::error!(
                                    "Failed to declare Zenoh subscriber on action feedback: {err}"
                                );
                            }
                        }
                    });
                    entry.sender = new_tx;
                    entry.worker_handle = handle;
                    entry.sub_count = 1;
                    new_rx
                } else {
                    entry.sub_count += 1;
                    entry.sender.subscribe()
                }
            }
            std::collections::hash_map::Entry::Vacant(vac) => {
                let (new_tx, new_rx) = broadcast::channel(CHANNEL_CAPACITY);
                let session = Arc::clone(&self.session);
                let tx_forward = new_tx.clone();
                let handle = tokio::spawn(async move {
                    match session
                        .declare_subscriber(ACTION_FEEDBACK_WILDCARD_TOPIC)
                        .await
                    {
                        Ok(subscriber) => {
                            log::info!("Declared Zenoh subscriber for action feedback on {ACTION_FEEDBACK_WILDCARD_TOPIC}");
                            while let Ok(sample) = subscriber.recv_async().await {
                                let payload_bytes = sample.payload().to_bytes();
                                let payload_str = String::from_utf8_lossy(&payload_bytes);
                                if let Ok(frame) =
                                    serde_json::from_str::<ActionFeedbackFrame>(&payload_str)
                                {
                                    let _ = tx_forward.send(frame);
                                } else if let Ok(fb) =
                                    serde_json::from_str::<PickAndPlaceFeedback>(&payload_str)
                                {
                                    let now_ns = std::time::SystemTime::now()
                                        .duration_since(std::time::UNIX_EPOCH)
                                        .map_or(0, |d| {
                                            u64::try_from(d.as_nanos()).unwrap_or(u64::MAX)
                                        });
                                    let frame = ActionFeedbackFrame::new(
                                        "arm_controller",
                                        fb.phase,
                                        fb.percent_complete,
                                        now_ns,
                                    );
                                    let _ = tx_forward.send(frame);
                                }
                            }
                        }
                        Err(err) => {
                            log::error!(
                                "Failed to declare Zenoh subscriber on action feedback: {err}"
                            );
                        }
                    }
                });
                vac.insert(ActionFeedbackStreamEntry {
                    sender: new_tx,
                    sub_count: 1,
                    worker_handle: handle,
                });
                new_rx
            }
        };
        drop(streams);

        let r_id = robot_id.to_string();
        let streams_map = Arc::clone(&self.feedback_streams);

        let guard = Box::new(move || {
            let mut streams = streams_map
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            if let std::collections::hash_map::Entry::Occupied(mut occ) =
                streams.entry(r_id.clone())
            {
                let entry = occ.get_mut();
                entry.sub_count = entry.sub_count.saturating_sub(1);
                if entry.sub_count == 0 {
                    let removed = occ.remove();
                    removed.worker_handle.abort();
                    log::info!("Torn down Zenoh action feedback streaming worker for robot {r_id}");
                }
            }
        });

        Ok(ActionFeedbackSubscription {
            receiver: rx,
            drop_guard: Some(guard),
        })
    }
}
