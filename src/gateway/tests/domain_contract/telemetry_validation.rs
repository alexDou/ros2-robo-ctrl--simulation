use gateway::domain::{
    validate_joint_positions, ArmJointPositions, DomainError, PalmState, RobotState,
    RobotTelemetryEvent,
};
use serde_json::json;

#[test]
fn test_robot_telemetry_event_malformed_fails() {
    let invalid_joints = json!({
        "timestamp_ns": 12345,
        "robot_state": "IDLE",
        "joint_positions": [0.0, 1.0], // only 2 joints instead of 6
    })
    .to_string();

    let result: Result<RobotTelemetryEvent, _> = serde_json::from_str(&invalid_joints);
    assert!(
        result.is_err(),
        "Expected deserialization to fail for invalid joint count (too few)"
    );

    let too_many_joints = json!({
        "timestamp_ns": 12345,
        "robot_state": "IDLE",
        "joint_positions": [0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0], // 7 joints instead of 6
    })
    .to_string();

    let result: Result<RobotTelemetryEvent, _> = serde_json::from_str(&too_many_joints);
    assert!(
        result.is_err(),
        "Expected deserialization to fail for invalid joint count (too many)"
    );

    let non_number_joints = json!({
        "timestamp_ns": 12345,
        "robot_state": "IDLE",
        "joint_positions": ["not_a_number", 0.0, 0.0, 0.0, 0.0, 0.0],
    })
    .to_string();

    let result: Result<RobotTelemetryEvent, _> = serde_json::from_str(&non_number_joints);
    assert!(
        result.is_err(),
        "Expected deserialization to fail for non-numeric joint value"
    );

    let invalid_state = json!({
        "timestamp_ns": 12345,
        "robot_state": "RUNNING_FAST", // Invalid state enum
        "joint_positions": [0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    })
    .to_string();

    let result: Result<RobotTelemetryEvent, _> = serde_json::from_str(&invalid_state);
    assert!(
        result.is_err(),
        "Expected deserialization to fail for invalid robot_state"
    );

    let negative_timestamp = json!({
        "timestamp_ns": -1, // Negative timestamp
        "robot_state": "IDLE",
        "joint_positions": [0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    })
    .to_string();

    let result: Result<RobotTelemetryEvent, _> = serde_json::from_str(&negative_timestamp);
    assert!(
        result.is_err(),
        "Expected deserialization to fail for negative timestamp"
    );
}

#[test]
fn test_robot_telemetry_event_non_finite_validation() {
    let valid_positions: ArmJointPositions = [0.0, -1.57, 1.57, 0.0, 0.0, 0.0];
    assert_eq!(validate_joint_positions(&valid_positions), Ok(()));

    let valid_event = RobotTelemetryEvent {
        timestamp_ns: 12345,
        robot_state: RobotState::Idle,
        joint_positions: valid_positions,
        palm_state: PalmState::default(),
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
    assert_eq!(valid_event.validate(), Ok(()));

    let nan_event = RobotTelemetryEvent {
        timestamp_ns: 12345,
        robot_state: RobotState::Idle,
        joint_positions: [f64::NAN, 0.0, 0.0, 0.0, 0.0, 0.0],
        palm_state: PalmState::default(),
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
    assert_eq!(
        nan_event.validate(),
        Err(DomainError::InvalidJointPositions)
    );

    let inf_event = RobotTelemetryEvent {
        timestamp_ns: 12345,
        robot_state: RobotState::Idle,
        joint_positions: [0.0, f64::INFINITY, 0.0, 0.0, 0.0, 0.0],
        palm_state: PalmState::default(),
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
    assert_eq!(
        inf_event.validate(),
        Err(DomainError::InvalidJointPositions)
    );

    let neg_inf_event = RobotTelemetryEvent {
        timestamp_ns: 12345,
        robot_state: RobotState::Idle,
        joint_positions: [0.0, 0.0, f64::NEG_INFINITY, 0.0, 0.0, 0.0],
        palm_state: PalmState::default(),
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
    assert_eq!(
        neg_inf_event.validate(),
        Err(DomainError::InvalidJointPositions)
    );
}
