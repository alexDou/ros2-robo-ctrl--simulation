use gateway::domain::{PalmState, RobotState, RobotTelemetryEvent};

#[test]
fn test_robot_telemetry_event_workcell_state_required_round_trip() {
    // Unit 6.7.0: required workcell_state {id,x,y,z} buckets, never cut id.
    let event = RobotTelemetryEvent {
        timestamp_ns: 1_725_894_942_000_000_000,
        robot_state: RobotState::Idle,
        joint_positions: [0.0, -1.57, 1.57, 0.0, 0.0, 0.0],
        palm_state: PalmState::default(),
        inference_metrics: None,
        command_id: None,
        workcell_state: gateway::domain::WorkcellState {
            spawned: vec![gateway::domain::GearEntry {
                id: "gear-1".to_string(),
                x: 0.5,
                y: 0.1,
                z: 0.0,
                origin_x: None,
                origin_y: None,
                origin_z: None,
                color: gateway::domain::GearColor::White,
                intact: true,
            }],
            in_progress: Vec::new(),
            processed: Vec::new(),
            active_id: Some("gear-1".to_string()),
        },
        phase: None,
    };
    let serialized = serde_json::to_string(&event).expect("Serialization failed");
    let deserialized: RobotTelemetryEvent =
        serde_json::from_str(&serialized).expect("Deserialization failed");
    assert_eq!(event, deserialized);
    assert_eq!(deserialized.workcell_state.spawned[0].id, "gear-1");
    assert_eq!(
        deserialized.workcell_state.active_id.as_deref(),
        Some("gear-1")
    );

    // Missing workcell_state rejected (legacy senders must upgrade).
    assert!(serde_json::from_str::<RobotTelemetryEvent>(
        r#"{"timestamp_ns":1,"robot_state":"IDLE","joint_positions":[0.0,0.0,0.0,0.0,0.0,0.0]}"#
    )
    .is_err());
}

#[test]
fn test_robot_telemetry_event_workcell_origin_optional_round_trip() {
    // Unit 6.7.4: origin_* optional on GearEntry, coords verbatim incl origin.
    let event = RobotTelemetryEvent {
        timestamp_ns: 1_725_894_942_000_000_000,
        robot_state: RobotState::Idle,
        joint_positions: [0.0, -1.57, 1.57, 0.0, 0.0, 0.0],
        palm_state: PalmState::default(),
        inference_metrics: None,
        command_id: None,
        workcell_state: gateway::domain::WorkcellState {
            spawned: vec![gateway::domain::GearEntry {
                id: "gear-0".to_string(),
                x: 0.45,
                y: 0.10,
                z: 0.0,
                origin_x: None,
                origin_y: None,
                origin_z: None,
                color: gateway::domain::GearColor::White,
                intact: true,
            }],
            in_progress: vec![gateway::domain::GearEntry {
                id: "gear-1".to_string(),
                x: 0.45,
                y: 0.10,
                z: 0.0,
                origin_x: Some(0.45),
                origin_y: Some(0.10),
                origin_z: Some(0.0),
                color: gateway::domain::GearColor::White,
                intact: true,
            }],
            processed: vec![gateway::domain::GearEntry {
                id: "gear-2".to_string(),
                x: 0.4,
                y: -0.3,
                z: 0.02,
                origin_x: Some(0.5),
                origin_y: Some(0.15),
                origin_z: Some(0.0),
                color: gateway::domain::GearColor::White,
                intact: true,
            }],
            active_id: Some("gear-1".to_string()),
        },
        phase: None,
    };
    let serialized = serde_json::to_string(&event).expect("Serialization failed");
    // Spawned entry omits origin keys (skip_serializing_if None); moved entries carry them verbatim.
    let spawned_wire = serialized
        .split("spawned")
        .nth(1)
        .expect("spawned")
        .split(']')
        .next()
        .expect("end");
    assert!(!spawned_wire.contains("origin"));
    assert!(serialized.contains(r#""origin_x":0.45"#));
    let deserialized: RobotTelemetryEvent =
        serde_json::from_str(&serialized).expect("Deserialization failed");
    assert_eq!(event, deserialized);
    assert_eq!(deserialized.workcell_state.spawned[0].origin_x, None);
    assert_eq!(
        deserialized.workcell_state.in_progress[0].origin_x,
        Some(0.45)
    );
    assert_eq!(
        deserialized.workcell_state.processed[0].origin_y,
        Some(0.15)
    );
}
