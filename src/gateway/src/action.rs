//! ROS 2 Action interfaces and wire contracts for PickAndPlace.action.

use serde::{Deserialize, Serialize};

/// Canonical Zenoh key expression for ROS 2 PickAndPlace action goal.
pub const ACTION_GOAL_TOPIC: &str = "arm_controller/pick_and_place/_action/send_goal";

/// DDS-prefixed Zenoh key expression used by zenoh-bridge-ros2dds for action goal.
pub const ROS2_ACTION_GOAL_TOPIC: &str = "rt/arm_controller/pick_and_place/_action/send_goal";

/// Canonical Zenoh key expression for ROS 2 PickAndPlace action feedback.
pub const ACTION_FEEDBACK_TOPIC: &str = "rt/arm_controller/pick_and_place/_action/feedback";

/// Wildcard topic matching both bare and rt/-prefixed feedback publications.
pub const ACTION_FEEDBACK_WILDCARD_TOPIC: &str =
    "**/arm_controller/pick_and_place/_action/feedback";

/// 3D Cartesian point matching ROS geometry_msgs/Point.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ActionPoint {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

impl ActionPoint {
    /// Creates a new 3D Cartesian point.
    #[must_use]
    pub const fn new(x: f64, y: f64, z: f64) -> Self {
        Self { x, y, z }
    }
}

/// Goal contract for PickAndPlace.action.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PickAndPlaceGoal {
    pub pick_coords: ActionPoint,
    pub drop_coords: ActionPoint,
    pub use_custom_drop: bool,
    pub command_id: String,
}

/// Feedback contract for PickAndPlace.action.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PickAndPlaceFeedback {
    pub phase: String,
    pub percent_complete: f32,
}

/// Progress frame streamed back to TeleopClient over WebSocket.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ActionFeedbackFrame {
    pub r#type: String,
    pub command_id: String,
    pub phase: String,
    pub percent_complete: f32,
    pub timestamp_ns: u64,
}

impl ActionFeedbackFrame {
    /// Constructs a new `ActionFeedbackFrame` with canonical type "ACTION_FEEDBACK".
    #[must_use]
    pub fn new(
        command_id: impl Into<String>,
        phase: impl Into<String>,
        percent_complete: f32,
        timestamp_ns: u64,
    ) -> Self {
        Self {
            r#type: "ACTION_FEEDBACK".to_string(),
            command_id: command_id.into(),
            phase: phase.into(),
            percent_complete,
            timestamp_ns,
        }
    }
}
