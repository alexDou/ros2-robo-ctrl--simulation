use gateway::domain::{CommandType, RobotCommand};
use serde_json::json;

#[test]
fn test_robot_command_ping_serialization_round_trip() {
    let cmd = RobotCommand {
        command_id: "a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d".to_string(),
        sender_id: "ui-client".to_string(),
        timestamp_ns: 1_725_894_942_000_000_000,
        r#type: CommandType::Ping,
        payload: json!({}),
    };

    let serialized = serde_json::to_string(&cmd).expect("Serialization failed");
    let deserialized: RobotCommand =
        serde_json::from_str(&serialized).expect("Deserialization failed");

    assert_eq!(cmd, deserialized);
    assert_eq!(deserialized.r#type, CommandType::Ping);
}

#[test]
fn test_robot_command_malformed_fails_deserialization() {
    let invalid_json = json!({
        "command_id": "123",
        "sender_id": "ui-client",
        "timestamp_ns": 12345,
        "type": "INVALID_COMMAND_TYPE",
        "payload": {}
    })
    .to_string();

    let result: Result<RobotCommand, _> = serde_json::from_str(&invalid_json);
    assert!(
        result.is_err(),
        "Expected deserialization to fail for invalid command type"
    );
}
