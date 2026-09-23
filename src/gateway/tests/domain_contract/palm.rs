use gateway::domain::{
    CommandType, PalmAction, PalmActuatePayload, PalmState, RobotCommand, RobotState,
    RobotTelemetryEvent,
};
use serde_json::json;

#[test]
fn test_palm_actuate_payload_serialization_round_trip() {
    let payload = PalmActuatePayload {
        action: PalmAction::Grasp,
    };
    let serialized = serde_json::to_string(&payload).expect("Serialize PalmActuatePayload");
    assert_eq!(serialized, r#"{"action":"GRASP"}"#);

    let deserialized: PalmActuatePayload =
        serde_json::from_str(&serialized).expect("Deserialize PalmActuatePayload");
    assert_eq!(deserialized.action, PalmAction::Grasp);

    let release_payload: PalmActuatePayload =
        serde_json::from_str(r#"{"action":"RELEASE"}"#).expect("Deserialize RELEASE action");
    assert_eq!(release_payload.action, PalmAction::Release);

    let invalid_res: Result<PalmActuatePayload, _> =
        serde_json::from_str(r#"{"action":"UNKNOWN"}"#);
    assert!(
        invalid_res.is_err(),
        "Expected deserialization to fail on invalid action"
    );

    // Command wrapper
    let cmd = RobotCommand {
        command_id: "a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d".to_string(),
        sender_id: "ui-client".to_string(),
        timestamp_ns: 1_725_894_942_000_000_000,
        r#type: CommandType::PalmActuate,
        payload: serde_json::to_value(&payload).expect("payload to value"),
    };
    let cmd_json = serde_json::to_string(&cmd).expect("Serialize PalmActuate command");
    let cmd_deserialized: RobotCommand =
        serde_json::from_str(&cmd_json).expect("Deserialize PalmActuate command");
    assert_eq!(cmd_deserialized.r#type, CommandType::PalmActuate);
}

#[test]
fn test_robot_telemetry_event_with_palm_state() {
    let event = RobotTelemetryEvent {
        timestamp_ns: 1_725_894_942_000_000_000,
        robot_state: RobotState::Idle,
        joint_positions: [0.0, -1.57, 1.57, 0.0, 0.0, 0.0],
        palm_state: PalmState { is_grasped: true },
        inference_metrics: None,
        command_id: None,
        workcell_state: gateway::domain::WorkcellState {
            spawned: Vec::new(),
            in_progress: Vec::new(),
            processed: Vec::new(),
            active_id: None,
        },
        phase: None,
    };
    let serialized = serde_json::to_string(&event).expect("Serialize telemetry event");
    assert!(serialized.contains(r#""palm_state":{"is_grasped":true}"#));

    let deserialized: RobotTelemetryEvent =
        serde_json::from_str(&serialized).expect("Deserialize telemetry event");
    assert!(deserialized.palm_state.is_grasped);

    // Safe default: missing palm_state deserializes to false
    let raw_no_palm = json!({
        "timestamp_ns": 12345,
        "robot_state": "IDLE",
        "joint_positions": [0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        "workcell_state": {"spawned": [], "in_progress": [], "processed": []},
    })
    .to_string();
    let deserialized_default: RobotTelemetryEvent =
        serde_json::from_str(&raw_no_palm).expect("Deserialize telemetry without palm_state");
    assert!(!deserialized_default.palm_state.is_grasped);
}
