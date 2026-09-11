use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use thiserror::Error;
use tokio::sync::broadcast;

use crate::domain::{robot_command_topic, robot_telemetry_topic, DomainError, RobotCommand};

const CHANNEL_CAPACITY: usize = 512;

/// Errors arising during DataFabric operations.
#[derive(Debug, Error)]
pub enum FabricError {
    #[error("Domain key error: {0}")]
    Domain(#[from] DomainError),
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("Zenoh fabric error: {0}")]
    Zenoh(String),
    #[error("Channel error: {0}")]
    Channel(String),
}

/// Subscription handle wrapping broadcast receiver and holding a cleanup guard.
pub struct TelemetrySubscription {
    receiver: broadcast::Receiver<String>,
    drop_guard: Option<Box<dyn FnOnce() + Send>>,
}

impl std::fmt::Debug for TelemetrySubscription {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("TelemetrySubscription")
            .field("receiver", &self.receiver)
            .finish_non_exhaustive()
    }
}

impl std::ops::Deref for TelemetrySubscription {
    type Target = broadcast::Receiver<String>;

    fn deref(&self) -> &Self::Target {
        &self.receiver
    }
}

impl std::ops::DerefMut for TelemetrySubscription {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.receiver
    }
}

impl Drop for TelemetrySubscription {
    fn drop(&mut self) {
        if let Some(guard) = self.drop_guard.take() {
            guard();
        }
    }
}

/// In-memory fabric implementation for deterministic testing and decoupled development.
#[derive(Debug, Clone, Default)]
pub struct MemoryFabric {
    command_txs: Arc<Mutex<HashMap<String, broadcast::Sender<RobotCommand>>>>,
    telemetry_txs: Arc<Mutex<HashMap<String, broadcast::Sender<String>>>>,
    active_subscriptions: Arc<Mutex<HashMap<String, usize>>>,
}

impl MemoryFabric {
    fn get_or_create_cmd_tx(&self, robot_id: &str) -> broadcast::Sender<RobotCommand> {
        let mut map = self.command_txs.lock().expect("lock command_txs");
        map.entry(robot_id.to_string())
            .or_insert_with(|| broadcast::channel(CHANNEL_CAPACITY).0)
            .clone()
    }

    fn get_or_create_telem_tx(&self, robot_id: &str) -> broadcast::Sender<String> {
        let mut map = self.telemetry_txs.lock().expect("lock telemetry_txs");
        map.entry(robot_id.to_string())
            .or_insert_with(|| broadcast::channel(CHANNEL_CAPACITY).0)
            .clone()
    }

    /// Returns the number of active telemetry subscriptions for `robot_id`.
    ///
    /// # Panics
    /// Panics if internal mutex is poisoned.
    pub fn active_telemetry_subscriptions(&self, robot_id: &str) -> usize {
        let map = self.active_subscriptions.lock().expect("lock active_subscriptions");
        map.get(robot_id).copied().unwrap_or(0)
    }

    /// Subscribes to telemetry on `robot/{robot_id}/telemetry` with lifecycle teardown on drop.
    ///
    /// # Errors
    /// Returns [`FabricError`] on invalid robot ID.
    ///
    /// # Panics
    /// Panics if internal mutex is poisoned.
    pub fn subscribe_telemetry(&self, robot_id: &str) -> Result<TelemetrySubscription, FabricError> {
        let _ = robot_telemetry_topic(robot_id)?;
        let tx = self.get_or_create_telem_tx(robot_id);
        let rx = tx.subscribe();

        let mut sub_map = self.active_subscriptions.lock().expect("lock active_subscriptions");
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
}

#[derive(Debug)]
struct ZenohStreamEntry {
    sender: broadcast::Sender<String>,
    sub_count: usize,
    worker_handle: tokio::task::JoinHandle<()>,
}

/// Zenoh DataFabric adapter interfacing with real Eclipse Zenoh sessions.
#[derive(Debug, Clone)]
pub struct ZenohFabric {
    session: Arc<zenoh::Session>,
    streams: Arc<Mutex<HashMap<String, ZenohStreamEntry>>>,
}

impl ZenohFabric {
    /// Creates a new `ZenohFabric` around an active Zenoh session.
    pub fn new(session: zenoh::Session) -> Self {
        Self {
            session: Arc::new(session),
            streams: Arc::new(Mutex::new(HashMap::new())),
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
    pub fn subscribe_telemetry(&self, robot_id: &str) -> Result<TelemetrySubscription, FabricError> {
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
                                    let payload_str = String::from_utf8_lossy(&sample.payload().to_bytes()).into_owned();
                                    let _ = tx_forward.send(payload_str);
                                }
                            }
                            Err(err) => {
                                log::error!("Failed to declare Zenoh subscriber on {topic_clone}: {err}");
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
                                let payload_str = String::from_utf8_lossy(&sample.payload().to_bytes()).into_owned();
                                let _ = tx_forward.send(payload_str);
                            }
                        }
                        Err(err) => {
                            log::error!("Failed to declare Zenoh subscriber on {topic_clone}: {err}");
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
            if let std::collections::hash_map::Entry::Occupied(mut occ) = streams.entry(r_id.clone()) {
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
}

/// Deep port facade abstracting DataFabric communication.
#[derive(Debug, Clone)]
pub enum DataFabricPort {
    Zenoh(ZenohFabric),
    Memory(MemoryFabric),
}

impl DataFabricPort {
    /// Constructs a Zenoh-backed DataFabric adapter.
    pub fn zenoh(session: zenoh::Session) -> Self {
        Self::Zenoh(ZenohFabric::new(session))
    }

    /// Constructs an in-memory DataFabric adapter.
    pub fn memory() -> Self {
        Self::Memory(MemoryFabric::default())
    }

    /// Returns the active telemetry subscriber count for `robot_id`.
    pub fn active_telemetry_subscriptions(&self, robot_id: &str) -> usize {
        match self {
            Self::Memory(mem) => mem.active_telemetry_subscriptions(robot_id),
            Self::Zenoh(z) => z.active_telemetry_subscriptions(robot_id),
        }
    }

    /// Publishes a validated `RobotCommand` to `robot/{robot_id}/command`.
    ///
    /// # Errors
    /// Returns [`FabricError`] on serialization failure, invalid topic, or Zenoh put error.
    pub async fn publish_command(&self, robot_id: &str, command: &RobotCommand) -> Result<(), FabricError> {
        let topic = robot_command_topic(robot_id)?;
        let json_payload = serde_json::to_string(command)?;

        match self {
            Self::Memory(mem) => {
                let tx = mem.get_or_create_cmd_tx(robot_id);
                // Send command, ignore error if no active receivers
                let _ = tx.send(command.clone());
                log::info!("Published command {} to memory fabric on {topic}", command.command_id);
                Ok(())
            }
            Self::Zenoh(z) => {
                z.session
                    .put(&topic, json_payload)
                    .await
                    .map_err(|e| FabricError::Zenoh(e.to_string()))?;
                log::info!("Published command {} to Zenoh on {topic}", command.command_id);
                Ok(())
            }
        }
    }

    /// Subscribes to telemetry events on `robot/{robot_id}/telemetry`.
    ///
    /// # Errors
    /// Returns [`FabricError`] on invalid robot ID.
    pub fn subscribe_telemetry(&self, robot_id: &str) -> Result<TelemetrySubscription, FabricError> {
        match self {
            Self::Memory(mem) => mem.subscribe_telemetry(robot_id),
            Self::Zenoh(z) => z.subscribe_telemetry(robot_id),
        }
    }

    /// Publishes a raw telemetry JSON string to `robot/{robot_id}/telemetry`.
    ///
    /// # Errors
    /// Returns [`FabricError`] if robot ID is invalid or transmission fails.
    pub fn publish_telemetry(&self, robot_id: &str, telemetry_json: &str) -> Result<(), FabricError> {
        let topic = robot_telemetry_topic(robot_id)?;
        match self {
            Self::Memory(mem) => {
                let tx = mem.get_or_create_telem_tx(robot_id);
                let _ = tx.send(telemetry_json.to_string());
                Ok(())
            }
            Self::Zenoh(_) => {
                // Synchronous bridge helper if needed
                Err(FabricError::Zenoh(format!("Direct sync telemetry put on {topic} unsupported")))
            }
        }
    }

    /// Subscribes to commands emitted for `robot_id` (used in tests or EdgeNode mocks).
    ///
    /// # Errors
    /// Returns [`FabricError`] if robot ID is invalid.
    pub fn subscribe_command(&self, robot_id: &str) -> Result<broadcast::Receiver<RobotCommand>, FabricError> {
        let _ = robot_command_topic(robot_id)?;
        match self {
            Self::Memory(mem) => {
                let tx = mem.get_or_create_cmd_tx(robot_id);
                Ok(tx.subscribe())
            }
            Self::Zenoh(_) => Err(FabricError::Zenoh("Zenoh direct command subscribe helper unimplemented".into())),
        }
    }
}
