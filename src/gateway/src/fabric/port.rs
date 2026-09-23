//! Deep port facade over Memory/Zenoh adapters.

use std::sync::Arc;
use tokio::sync::broadcast;

use super::super::action::{ActionFeedbackFrame, PickAndPlaceGoal};
use super::super::domain::{robot_command_topic, RobotCommand};
use super::error::FabricError;
use super::memory::MemoryFabric;
use super::subscriptions::{ActionFeedbackSubscription, TelemetrySubscription};
use super::zenoh::ZenohFabric;

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
    pub async fn publish_command(
        &self,
        robot_id: &str,
        command: &RobotCommand,
    ) -> Result<(), FabricError> {
        let topic = robot_command_topic(robot_id)?;
        let json_payload = serde_json::to_string(command)?;

        match self {
            Self::Memory(mem) => {
                let tx = mem.get_or_create_cmd_tx(robot_id);
                // Send command, ignore error if no active receivers
                let _ = tx.send(command.clone());
                log::info!(
                    "Published command {} to memory fabric on {topic}",
                    command.command_id
                );
                Ok(())
            }
            Self::Zenoh(z) => {
                z.session
                    .put(&topic, json_payload)
                    .await
                    .map_err(|e| FabricError::Zenoh(e.to_string()))?;
                log::info!(
                    "Published command {} to Zenoh on {topic}",
                    command.command_id
                );
                Ok(())
            }
        }
    }

    /// Subscribes to telemetry events on `robot/{robot_id}/telemetry`.
    ///
    /// # Errors
    /// Returns [`FabricError`] on invalid robot ID.
    pub fn subscribe_telemetry(
        &self,
        robot_id: &str,
    ) -> Result<TelemetrySubscription, FabricError> {
        match self {
            Self::Memory(mem) => mem.subscribe_telemetry(robot_id),
            Self::Zenoh(z) => z.subscribe_telemetry(robot_id),
        }
    }

    /// Publishes a raw telemetry JSON string to `robot/{robot_id}/telemetry` asynchronously.
    ///
    /// # Errors
    /// Returns [`FabricError`] if robot ID is invalid or transmission fails.
    pub async fn publish_telemetry_async(
        &self,
        robot_id: &str,
        telemetry_json: &str,
    ) -> Result<(), FabricError> {
        match self {
            Self::Memory(mem) => mem.publish_telemetry(robot_id, telemetry_json),
            Self::Zenoh(z) => z.publish_telemetry_async(robot_id, telemetry_json).await,
        }
    }

    /// Publishes a raw telemetry JSON string to `robot/{robot_id}/telemetry`.
    ///
    /// # Errors
    /// Returns [`FabricError`] if robot ID is invalid or transmission fails.
    pub fn publish_telemetry(
        &self,
        robot_id: &str,
        telemetry_json: &str,
    ) -> Result<(), FabricError> {
        match self {
            Self::Memory(mem) => mem.publish_telemetry(robot_id, telemetry_json),
            Self::Zenoh(z) => z.publish_telemetry(robot_id, telemetry_json),
        }
    }

    /// Subscribes to commands emitted for `robot_id` (used in tests or EdgeNode mocks).
    ///
    /// # Errors
    /// Returns [`FabricError`] if robot ID is invalid.
    pub fn subscribe_command(
        &self,
        robot_id: &str,
    ) -> Result<broadcast::Receiver<RobotCommand>, FabricError> {
        let _ = robot_command_topic(robot_id)?;
        match self {
            Self::Memory(mem) => {
                let tx = mem.get_or_create_cmd_tx(robot_id);
                Ok(tx.subscribe())
            }
            Self::Zenoh(_) => Err(FabricError::Zenoh(
                "Zenoh direct command subscribe helper unimplemented".into(),
            )),
        }
    }

    /// Publishes a PickAndPlace action goal for `robot_id`.
    pub async fn publish_action_goal(
        &self,
        robot_id: &str,
        goal: &PickAndPlaceGoal,
    ) -> Result<(), FabricError> {
        match self {
            Self::Memory(mem) => mem.publish_action_goal(robot_id, goal),
            Self::Zenoh(z) => z.publish_action_goal(robot_id, goal).await,
        }
    }

    /// Subscribes to PickAndPlace action goals for `robot_id`.
    pub fn subscribe_action_goal(
        &self,
        robot_id: &str,
    ) -> Result<broadcast::Receiver<PickAndPlaceGoal>, FabricError> {
        match self {
            Self::Memory(mem) => mem.subscribe_action_goal(robot_id),
            Self::Zenoh(_) => Err(FabricError::Zenoh(
                "Zenoh direct action goal subscribe unsupported".into(),
            )),
        }
    }

    /// Publishes Action feedback for `robot_id`.
    pub async fn publish_action_feedback(
        &self,
        robot_id: &str,
        feedback: &ActionFeedbackFrame,
    ) -> Result<(), FabricError> {
        match self {
            Self::Memory(mem) => mem.publish_action_feedback(robot_id, feedback),
            Self::Zenoh(z) => z.publish_action_feedback(robot_id, feedback).await,
        }
    }

    /// Subscribes to Action feedback for `robot_id`.
    pub fn subscribe_action_feedback(
        &self,
        robot_id: &str,
    ) -> Result<ActionFeedbackSubscription, FabricError> {
        match self {
            Self::Memory(mem) => mem.subscribe_action_feedback(robot_id),
            Self::Zenoh(z) => z.subscribe_action_feedback(robot_id),
        }
    }

    /// Returns the inner Zenoh session if backed by Zenoh.
    #[must_use]
    pub fn zenoh_session(&self) -> Option<Arc<zenoh::Session>> {
        match self {
            Self::Memory(_) => None,
            Self::Zenoh(z) => Some(z.session()),
        }
    }
}
