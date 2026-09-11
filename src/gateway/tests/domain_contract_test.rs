use gateway::domain::{
    parse_robot_topic, robot_command_topic, robot_telemetry_topic, validate_joint_positions,
    ArmJointPositions, CommandType, DomainError, ErrorFrame, InferenceMetrics, RobotCommand,
    RobotState, RobotTelemetryEvent, CANONICAL_UR5E_JOINTS, UR5E_JOINTS,
};
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
    assert!(result.is_err(), "Expected deserialization to fail for invalid command type");
}

#[test]
fn test_robot_telemetry_event_serialization_round_trip() {
    let event = RobotTelemetryEvent {
        timestamp_ns: 1_725_894_942_000_000_000,
        robot_state: RobotState::Idle,
        joint_positions: [0.0, -1.57, 1.57, 0.0, 0.0, 0.0],
        inference_metrics: Some(InferenceMetrics {
            latency_ms: 12.4,
            confidence: 0.96,
            detected_object: "target_box".to_string(),
        }),
        command_id: Some("a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d".to_string()),
    };

    let serialized = serde_json::to_string(&event).expect("Serialization failed");
    let deserialized: RobotTelemetryEvent =
        serde_json::from_str(&serialized).expect("Deserialization failed");

    assert_eq!(event, deserialized);
    assert_eq!(deserialized.robot_state, RobotState::Idle);
    assert_eq!(deserialized.joint_positions.len(), 6);
}

#[test]
fn test_canonical_joint_constants() {
    assert_eq!(
        UR5E_JOINTS,
        [
            "shoulder_pan_joint",
            "shoulder_lift_joint",
            "elbow_joint",
            "wrist_1_joint",
            "wrist_2_joint",
            "wrist_3_joint",
        ]
    );
    assert_eq!(CANONICAL_UR5E_JOINTS, UR5E_JOINTS);
    assert_eq!(UR5E_JOINTS.len(), 6);
}

#[test]
fn test_robot_telemetry_event_malformed_fails() {
    let invalid_joints = json!({
        "timestamp_ns": 12345,
        "robot_state": "IDLE",
        "joint_positions": [0.0, 1.0], // only 2 joints instead of 6
    })
    .to_string();

    let result: Result<RobotTelemetryEvent, _> = serde_json::from_str(&invalid_joints);
    assert!(result.is_err(), "Expected deserialization to fail for invalid joint count (too few)");

    let too_many_joints = json!({
        "timestamp_ns": 12345,
        "robot_state": "IDLE",
        "joint_positions": [0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0], // 7 joints instead of 6
    })
    .to_string();

    let result: Result<RobotTelemetryEvent, _> = serde_json::from_str(&too_many_joints);
    assert!(result.is_err(), "Expected deserialization to fail for invalid joint count (too many)");

    let non_number_joints = json!({
        "timestamp_ns": 12345,
        "robot_state": "IDLE",
        "joint_positions": ["not_a_number", 0.0, 0.0, 0.0, 0.0, 0.0],
    })
    .to_string();

    let result: Result<RobotTelemetryEvent, _> = serde_json::from_str(&non_number_joints);
    assert!(result.is_err(), "Expected deserialization to fail for non-numeric joint value");

    let invalid_state = json!({
        "timestamp_ns": 12345,
        "robot_state": "RUNNING_FAST", // Invalid state enum
        "joint_positions": [0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    })
    .to_string();

    let result: Result<RobotTelemetryEvent, _> = serde_json::from_str(&invalid_state);
    assert!(result.is_err(), "Expected deserialization to fail for invalid robot_state");

    let negative_timestamp = json!({
        "timestamp_ns": -1, // Negative timestamp
        "robot_state": "IDLE",
        "joint_positions": [0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    })
    .to_string();

    let result: Result<RobotTelemetryEvent, _> = serde_json::from_str(&negative_timestamp);
    assert!(result.is_err(), "Expected deserialization to fail for negative timestamp");
}

#[test]
fn test_robot_telemetry_event_non_finite_validation() {
    let valid_positions: ArmJointPositions = [0.0, -1.57, 1.57, 0.0, 0.0, 0.0];
    assert_eq!(validate_joint_positions(&valid_positions), Ok(()));

    let valid_event = RobotTelemetryEvent {
        timestamp_ns: 12345,
        robot_state: RobotState::Idle,
        joint_positions: valid_positions,
        inference_metrics: None,
        command_id: None,
    };
    assert_eq!(valid_event.validate(), Ok(()));

    let nan_event = RobotTelemetryEvent {
        timestamp_ns: 12345,
        robot_state: RobotState::Idle,
        joint_positions: [f64::NAN, 0.0, 0.0, 0.0, 0.0, 0.0],
        inference_metrics: None,
        command_id: None,
    };
    assert_eq!(nan_event.validate(), Err(DomainError::InvalidJointPositions));

    let inf_event = RobotTelemetryEvent {
        timestamp_ns: 12345,
        robot_state: RobotState::Idle,
        joint_positions: [0.0, f64::INFINITY, 0.0, 0.0, 0.0, 0.0],
        inference_metrics: None,
        command_id: None,
    };
    assert_eq!(inf_event.validate(), Err(DomainError::InvalidJointPositions));

    let neg_inf_event = RobotTelemetryEvent {
        timestamp_ns: 12345,
        robot_state: RobotState::Idle,
        joint_positions: [0.0, 0.0, f64::NEG_INFINITY, 0.0, 0.0, 0.0],
        inference_metrics: None,
        command_id: None,
    };
    assert_eq!(neg_inf_event.validate(), Err(DomainError::InvalidJointPositions));
}

#[test]
fn test_error_frame_serialization_round_trip() {
    let err = ErrorFrame::new("SCHEMA_VIOLATION", "Payload missing command_id", 1_725_894_942_000);
    let serialized = serde_json::to_string(&err).expect("Serialization failed");
    let deserialized: ErrorFrame = serde_json::from_str(&serialized).expect("Deserialization failed");

    assert_eq!(err, deserialized);
    assert_eq!(deserialized.r#type, "ERROR");
    assert_eq!(deserialized.error_code, "SCHEMA_VIOLATION");
}

#[test]
fn test_datafabric_key_expressions() {
    let cmd_topic = robot_command_topic("robot-0").expect("Valid robot ID");
    assert_eq!(cmd_topic, "robot/robot-0/command");

    let tel_topic = robot_telemetry_topic("robot-0").expect("Valid robot ID");
    assert_eq!(tel_topic, "robot/robot-0/telemetry");

    assert_eq!(parse_robot_topic("robot/robot-0/command"), Some(("robot-0".to_string(), "command")));
    assert_eq!(parse_robot_topic("robot/robot-0/telemetry"), Some(("robot-0".to_string(), "telemetry")));
    assert_eq!(parse_robot_topic("invalid/topic/structure"), None);
    assert_eq!(parse_robot_topic("robot//command"), None);

    assert!(robot_command_topic("").is_err());
    assert!(robot_command_topic("bad/id").is_err());
}
