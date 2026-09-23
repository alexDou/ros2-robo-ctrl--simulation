//! ENGAGE/STANDBY handshake builders + retry policy.

/// Maximum ENGAGE handshake retries after the initial attempt.
pub(super) const HANDSHAKE_MAX_RETRIES: u32 = 3;
/// Delay between ENGAGE handshake retries.
pub(super) const HANDSHAKE_RETRY_INTERVAL: std::time::Duration =
    std::time::Duration::from_millis(500);

pub(super) fn engage_command(robot_id: &str) -> crate::domain::RobotCommand {
    crate::domain::RobotCommand {
        command_id: format!("gateway-engage-{robot_id}-{0}", super::current_time_ns()),
        sender_id: "gateway".to_string(),
        timestamp_ns: super::current_time_ns(),
        r#type: crate::domain::CommandType::Engage,
        payload: serde_json::json!({}),
    }
}

pub(super) fn standby_command(robot_id: &str) -> crate::domain::RobotCommand {
    crate::domain::RobotCommand {
        command_id: format!("gateway-standby-{robot_id}-{0}", super::current_time_ns()),
        sender_id: "gateway".to_string(),
        timestamp_ns: super::current_time_ns(),
        payload: serde_json::json!({}),
        r#type: crate::domain::CommandType::Standby,
    }
}
