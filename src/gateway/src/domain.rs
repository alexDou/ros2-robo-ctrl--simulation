use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Error types encountered in domain validation and key resolution.
#[derive(Debug, Error, PartialEq, Eq)]
pub enum DomainError {
    #[error("Invalid robot ID: must be non-empty and not contain slashes")]
    InvalidRobotId,
}

/// Permitted operational command types for the EdgeNode.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CommandType {
    Ping,
    TeleopJointTarget,
    TrajectoryExecute,
    EmergencyStop,
    ResetFault,
}

/// Operational lifecycle state of the robotic manipulator.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RobotState {
    Booting,
    Idle,
    Processing,
    Executing,
    Fault,
}

/// Inference performance and classification metrics from Edge AI models.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct InferenceMetrics {
    pub latency_ms: f64,
    pub confidence: f64,
    pub detected_object: String,
}

/// Structured inbound instruction sent to EdgeNode.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RobotCommand {
    pub command_id: String,
    pub sender_id: String,
    pub timestamp_ns: u64,
    pub r#type: CommandType,
    pub payload: serde_json::Value,
}

/// Structured domain event emitted by EdgeNode.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RobotTelemetryEvent {
    pub timestamp_ns: u64,
    pub robot_state: RobotState,
    pub joint_positions: [f64; 6],
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub inference_metrics: Option<InferenceMetrics>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub command_id: Option<String>,
}

/// Structured error message sent by Gateway on schema or validation errors.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ErrorFrame {
    pub r#type: String,
    pub error_code: String,
    pub message: String,
    pub timestamp_ns: u64,
}

impl ErrorFrame {
    #[must_use]
    pub fn new(error_code: impl Into<String>, message: impl Into<String>, timestamp_ns: u64) -> Self {
        Self {
            r#type: "ERROR".to_string(),
            error_code: error_code.into(),
            message: message.into(),
            timestamp_ns,
        }
    }
}

/// Validates that a robot identifier is structurally valid.
fn validate_robot_id(robot_id: &str) -> Result<(), DomainError> {
    if robot_id.is_empty() || robot_id.contains('/') || robot_id.contains('\\') || robot_id.contains(' ') {
        return Err(DomainError::InvalidRobotId);
    }
    Ok(())
}

/// Returns the locked DataFabric command key expression for a robot.
///
/// # Errors
/// Returns [`DomainError::InvalidRobotId`] if `robot_id` is empty or contains path delimiters.
pub fn robot_command_topic(robot_id: &str) -> Result<String, DomainError> {
    validate_robot_id(robot_id)?;
    Ok(format!("robot/{robot_id}/command"))
}

/// Returns the locked DataFabric telemetry key expression for a robot.
///
/// # Errors
/// Returns [`DomainError::InvalidRobotId`] if `robot_id` is empty or contains path delimiters.
pub fn robot_telemetry_topic(robot_id: &str) -> Result<String, DomainError> {
    validate_robot_id(robot_id)?;
    Ok(format!("robot/{robot_id}/telemetry"))
}

/// Parses a DataFabric key expression into robot ID and channel.
#[must_use]
pub fn parse_robot_topic(topic: &str) -> Option<(String, &'static str)> {
    let parts: Vec<&str> = topic.split('/').collect();
    if parts.len() != 3 || parts[0] != "robot" || parts[1].is_empty() {
        return None;
    }

    match parts[2] {
        "command" => Some((parts[1].to_string(), "command")),
        "telemetry" => Some((parts[1].to_string(), "telemetry")),
        _ => None,
    }
}
