use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use thiserror::Error;
use tokio::sync::broadcast;

use crate::domain::{robot_command_topic, robot_telemetry_topic, DomainError, RobotCommand};

const CHANNEL_CAPACITY: usize = 256;

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

/// In-memory fabric implementation for deterministic testing and decoupled development.
#[derive(Debug, Clone, Default)]
pub struct MemoryFabric {
    command_txs: Arc<Mutex<HashMap<String, broadcast::Sender<RobotCommand>>>>,
    telemetry_txs: Arc<Mutex<HashMap<String, broadcast::Sender<String>>>>,
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
}

/// Zenoh DataFabric adapter interfacing with real Eclipse Zenoh sessions.
#[derive(Debug, Clone)]
pub struct ZenohFabric {
    session: Arc<zenoh::Session>,
    telemetry_txs: Arc<Mutex<HashMap<String, broadcast::Sender<String>>>>,
}

impl ZenohFabric {
    /// Creates a new `ZenohFabric` around an active Zenoh session.
    pub fn new(session: zenoh::Session) -> Self {
        Self {
            session: Arc::new(session),
            telemetry_txs: Arc::new(Mutex::new(HashMap::new())),
        }
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
    ///
    /// # Panics
    /// Panics if internal telemetry Mutex is poisoned.
    pub fn subscribe_telemetry(&self, robot_id: &str) -> Result<broadcast::Receiver<String>, FabricError> {
        let topic = robot_telemetry_topic(robot_id)?;

        match self {
            Self::Memory(mem) => {
                let tx = mem.get_or_create_telem_tx(robot_id);
                Ok(tx.subscribe())
            }
            Self::Zenoh(z) => {
                let mut map = z.telemetry_txs.lock().expect("lock telemetry_txs");
                if let Some(tx) = map.get(robot_id) {
                    return Ok(tx.subscribe());
                }

                let (tx, rx) = broadcast::channel(CHANNEL_CAPACITY);
                map.insert(robot_id.to_string(), tx.clone());
                drop(map);

                let session = Arc::clone(&z.session);
                let tx_forward = tx;

                tokio::spawn(async move {
                    match session.declare_subscriber(&topic).await {
                        Ok(subscriber) => {
                            log::info!("Declared Zenoh subscriber for {topic}");
                            while let Ok(sample) = subscriber.recv_async().await {
                                let payload_str = String::from_utf8_lossy(&sample.payload().to_bytes()).to_string();
                                if tx_forward.send(payload_str).is_err() {
                                    // All receivers dropped, continue listening for new sessions
                                }
                            }
                        }
                        Err(err) => {
                            log::error!("Failed to declare Zenoh subscriber on {topic}: {err}");
                        }
                    }
                });

                Ok(rx)
            }
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
