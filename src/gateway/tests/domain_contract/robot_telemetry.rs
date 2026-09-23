use gateway::domain::{
    InferenceMetrics, PalmState, RobotState, RobotTelemetryEvent, CANONICAL_UR5E_JOINTS,
    UR5E_JOINTS,
};

#[test]
fn test_robot_telemetry_event_serialization_round_trip() {
    let event = RobotTelemetryEvent {
        timestamp_ns: 1_725_894_942_000_000_000,
        robot_state: RobotState::Idle,
        joint_positions: [0.0, -1.57, 1.57, 0.0, 0.0, 0.0],
        palm_state: PalmState::default(),
        inference_metrics: Some(InferenceMetrics {
            latency_ms: 12.4,
            confidence: 0.96,
            detected_object: "target_box".to_string(),
        }),
        command_id: Some("a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d".to_string()),
        workcell_state: gateway::domain::WorkcellState {
            spawned: Vec::new(),
            in_progress: Vec::new(),
            processed: Vec::new(),
            active_id: None,
        },
        phase: None,
    };

    let serialized = serde_json::to_string(&event).expect("Serialization failed");
    let deserialized: RobotTelemetryEvent =
        serde_json::from_str(&serialized).expect("Deserialization failed");

    assert_eq!(event, deserialized);
    assert_eq!(deserialized.robot_state, RobotState::Idle);
    assert_eq!(deserialized.joint_positions.len(), 6);
}

#[test]
fn test_robot_telemetry_event_phase_optional_round_trip() {
    // Unit 6.6.7/4ixr: phase end-to-end edge->gateway->WS->buffer.
    let event = RobotTelemetryEvent {
        timestamp_ns: 1_725_894_942_000_000_000,
        robot_state: RobotState::Executing,
        joint_positions: [0.0, -1.57, 1.57, 0.0, 0.0, 0.0],
        palm_state: PalmState::default(),
        inference_metrics: None,
        command_id: None,
        workcell_state: gateway::domain::WorkcellState {
            spawned: Vec::new(),
            in_progress: Vec::new(),
            processed: Vec::new(),
            active_id: None,
        },
        phase: Some("RELEASING".to_string()),
    };
    let serialized = serde_json::to_string(&event).expect("Serialization failed");
    let deserialized: RobotTelemetryEvent =
        serde_json::from_str(&serialized).expect("Deserialization failed");
    assert_eq!(event, deserialized);
    assert_eq!(deserialized.phase.as_deref(), Some("RELEASING"));

    // Absent phase stays valid (debounce fallback); workcell_state required since 6.7.0.
    let legacy: RobotTelemetryEvent = serde_json::from_str(
        r#"{"timestamp_ns":1,"robot_state":"IDLE","joint_positions":[0.0,0.0,0.0,0.0,0.0,0.0],"workcell_state":{"spawned":[],"in_progress":[],"processed":[]}}"#,
    )
    .expect("Without phase must parse");
    assert_eq!(legacy.phase, None);
    // Missing workcell_state rejected (legacy senders must upgrade).
    assert!(serde_json::from_str::<RobotTelemetryEvent>(
        r#"{"timestamp_ns":1,"robot_state":"IDLE","joint_positions":[0.0,0.0,0.0,0.0,0.0,0.0]}"#
    )
    .is_err());
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
