//! In-memory DataFabric adapter (deterministic tests, decoupled dev).

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::broadcast;

use super::super::action::{ActionFeedbackFrame, PickAndPlaceGoal};
use super::super::domain::{robot_telemetry_topic, RobotCommand};
use super::error::FabricError;
use super::subscriptions::{ActionFeedbackSubscription, TelemetrySubscription};

const CHANNEL_CAPACITY: usize = 512;

/// In-memory fabric implementation for deterministic testing and decoupled development.
#[derive(Debug, Clone, Default)]
pub struct MemoryFabric {
    command_txs: Arc<Mutex<HashMap<String, broadcast::Sender<RobotCommand>>>>,
    telemetry_txs: Arc<Mutex<HashMap<String, broadcast::Sender<String>>>>,
    action_goal_txs: Arc<Mutex<HashMap<String, broadcast::Sender<PickAndPlaceGoal>>>>,
    action_feedback_txs: Arc<Mutex<HashMap<String, broadcast::Sender<ActionFeedbackFrame>>>>,
    active_subscriptions: Arc<Mutex<HashMap<String, usize>>>,
}

impl MemoryFabric {
    pub(crate) fn get_or_create_cmd_tx(&self, robot_id: &str) -> broadcast::Sender<RobotCommand> {
        let mut map = self.command_txs.lock().expect("lock command_txs");
        map.entry(robot_id.to_string())
            .or_insert_with(|| broadcast::channel(CHANNEL_CAPACITY).0)
            .clone()
    }

    pub(crate) fn get_or_create_telem_tx(&self, robot_id: &str) -> broadcast::Sender<String> {
        let mut map = self.telemetry_txs.lock().expect("lock telemetry_txs");
        map.entry(robot_id.to_string())
            .or_insert_with(|| broadcast::channel(CHANNEL_CAPACITY).0)
            .clone()
    }

    pub(crate) fn get_or_create_action_goal_tx(
        &self,
        robot_id: &str,
    ) -> broadcast::Sender<PickAndPlaceGoal> {
        let mut map = self.action_goal_txs.lock().expect("lock action_goal_txs");
        map.entry(robot_id.to_string())
            .or_insert_with(|| broadcast::channel(CHANNEL_CAPACITY).0)
            .clone()
    }

    pub(crate) fn get_or_create_action_feedback_tx(
        &self,
        robot_id: &str,
    ) -> broadcast::Sender<ActionFeedbackFrame> {
        let mut map = self
            .action_feedback_txs
            .lock()
            .expect("lock action_feedback_txs");
        map.entry(robot_id.to_string())
            .or_insert_with(|| broadcast::channel(CHANNEL_CAPACITY).0)
            .clone()
    }

    /// Returns the number of active telemetry subscriptions for `robot_id`.
    ///
    /// # Panics
    /// Panics if internal mutex is poisoned.
    pub fn active_telemetry_subscriptions(&self, robot_id: &str) -> usize {
        let map = self
            .active_subscriptions
            .lock()
            .expect("lock active_subscriptions");
        map.get(robot_id).copied().unwrap_or(0)
    }

    /// Subscribes to telemetry on `robot/{robot_id}/telemetry` with lifecycle teardown on drop.
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
        let _ = robot_telemetry_topic(robot_id)?;
        let tx = self.get_or_create_telem_tx(robot_id);
        let rx = tx.subscribe();

        let mut sub_map = self
            .active_subscriptions
            .lock()
            .expect("lock active_subscriptions");
        *sub_map.entry(robot_id.to_string()).or_insert(0) += 1;
        drop(sub_map);

        let active_map = Arc::clone(&self.active_subscriptions);
        let telem_map = Arc::clone(&self.telemetry_txs);
        let r_id = robot_id.to_string();

        let guard = Box::new(move || {
            let mut sub_map = active_map
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            let should_clean = match sub_map.entry(r_id.clone()) {
                std::collections::hash_map::Entry::Occupied(mut entry) => {
                    let count = entry.get_mut();
                    *count = count.saturating_sub(1);
                    if *count == 0 {
                        entry.remove();
                        true
                    } else {
                        false
                    }
                }
                std::collections::hash_map::Entry::Vacant(_) => false,
            };
            drop(sub_map);

            if should_clean {
                let mut txs = telem_map
                    .lock()
                    .unwrap_or_else(std::sync::PoisonError::into_inner);
                txs.remove(&r_id);
            }
        });

        Ok(TelemetrySubscription {
            receiver: rx,
            drop_guard: Some(guard),
        })
    }

    /// Publishes a raw telemetry JSON string to `robot/{robot_id}/telemetry`.
    ///
    /// # Errors
    /// Returns [`FabricError`] on invalid robot ID.
    pub fn publish_telemetry(
        &self,
        robot_id: &str,
        telemetry_json: &str,
    ) -> Result<(), FabricError> {
        let _ = robot_telemetry_topic(robot_id)?;
        let tx = self.get_or_create_telem_tx(robot_id);
        let _ = tx.send(telemetry_json.to_string());
        Ok(())
    }

    /// Publishes a PickAndPlace action goal for `robot_id`.
    pub fn publish_action_goal(
        &self,
        robot_id: &str,
        goal: &PickAndPlaceGoal,
    ) -> Result<(), FabricError> {
        // Bind goal to owner: future edge subscriber must ignore goals whose
        // command_id it did not originate (no consumer today; prevents steal).
        let mut goal = goal.clone();
        goal.command_id = format!("{robot_id}/{}", goal.command_id);
        let tx = self.get_or_create_action_goal_tx(robot_id);
        let _ = tx.send(goal);
        Ok(())
    }

    /// Subscribes to PickAndPlace action goals for `robot_id`.
    pub fn subscribe_action_goal(
        &self,
        robot_id: &str,
    ) -> Result<broadcast::Receiver<PickAndPlaceGoal>, FabricError> {
        let tx = self.get_or_create_action_goal_tx(robot_id);
        Ok(tx.subscribe())
    }

    /// Publishes Action feedback for `robot_id`.
    pub fn publish_action_feedback(
        &self,
        robot_id: &str,
        feedback: &ActionFeedbackFrame,
    ) -> Result<(), FabricError> {
        let tx = self.get_or_create_action_feedback_tx(robot_id);
        let _ = tx.send(feedback.clone());
        Ok(())
    }

    /// Subscribes to Action feedback for `robot_id`.
    pub fn subscribe_action_feedback(
        &self,
        robot_id: &str,
    ) -> Result<ActionFeedbackSubscription, FabricError> {
        let tx = self.get_or_create_action_feedback_tx(robot_id);
        Ok(ActionFeedbackSubscription {
            receiver: tx.subscribe(),
            drop_guard: None,
        })
    }
}
