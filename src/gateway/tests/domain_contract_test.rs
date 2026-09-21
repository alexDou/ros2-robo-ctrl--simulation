use gateway::domain::{
    parse_robot_topic, robot_command_topic, robot_telemetry_topic, validate_joint_positions,
    ArmJointPositions, ClearWorkspacePayload, CommandType, DomainError, EmergencyStopPayload,
    ErrorFrame, InferenceMetrics, PalmAction, PalmActuatePayload, PalmState,
    PickAndPlaceTargetPayload, PoseName, ResetFaultPayload, RobotCommand, RobotState,
    RobotTelemetryEvent, SpawnObjectPayload, SpawnObjectType, TrajectoryExecutePayload,
    CANONICAL_UR5E_JOINTS, UR5E_JOINTS,
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
    assert!(
        result.is_err(),
        "Expected deserialization to fail for invalid command type"
    );
}

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
    ).is_err());
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

#[test]
fn test_error_frame_serialization_round_trip() {
    let err = ErrorFrame::new(
        "SCHEMA_VIOLATION",
        "Payload missing command_id",
        1_725_894_942_000,
    );
    let serialized = serde_json::to_string(&err).expect("Serialization failed");
    let deserialized: ErrorFrame =
        serde_json::from_str(&serialized).expect("Deserialization failed");

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

    assert_eq!(
        parse_robot_topic("robot/robot-0/command"),
        Some(("robot-0".to_string(), "command"))
    );
    assert_eq!(
        parse_robot_topic("robot/robot-0/telemetry"),
        Some(("robot-0".to_string(), "telemetry"))
    );
    assert_eq!(parse_robot_topic("invalid/topic/structure"), None);
    assert_eq!(parse_robot_topic("robot//command"), None);

    assert!(robot_command_topic("").is_err());
    assert!(robot_command_topic("bad/id").is_err());
}

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
fn test_trajectory_execute_payload_serialization_round_trip() {
    let canned_home = TrajectoryExecutePayload {
        pose_name: Some(PoseName::Home),
        waypoints: None,
    };
    let serialized_home = serde_json::to_string(&canned_home).expect("Serialize Home payload");
    assert!(serialized_home.contains(r#""pose_name":"HOME""#));

    let deserialized_home: TrajectoryExecutePayload =
        serde_json::from_str(&serialized_home).expect("Deserialize Home payload");
    assert_eq!(deserialized_home.pose_name, Some(PoseName::Home));

    let canned_ready: TrajectoryExecutePayload =
        serde_json::from_str(r#"{"pose_name":"READY"}"#).expect("Deserialize READY");
    assert_eq!(canned_ready.pose_name, Some(PoseName::Ready));

    let canned_inspect: TrajectoryExecutePayload =
        serde_json::from_str(r#"{"pose_name":"INSPECT_POSE"}"#).expect("Deserialize INSPECT_POSE");
    assert_eq!(canned_inspect.pose_name, Some(PoseName::InspectPose));

    let waypoints = vec![
        [0.0, -1.57, 1.57, 0.0, 0.0, 0.0],
        [0.1, -1.50, 1.60, 0.0, 0.0, 0.0],
    ];
    let custom_traj = TrajectoryExecutePayload {
        pose_name: None,
        waypoints: Some(waypoints.clone()),
    };
    let serialized_custom =
        serde_json::to_string(&custom_traj).expect("Serialize custom trajectory");
    let deserialized_custom: TrajectoryExecutePayload =
        serde_json::from_str(&serialized_custom).expect("Deserialize custom trajectory");
    assert_eq!(deserialized_custom.waypoints, Some(waypoints));

    let invalid_pose: Result<TrajectoryExecutePayload, _> =
        serde_json::from_str(r#"{"pose_name":"INVALID_POSE"}"#);
    assert!(invalid_pose.is_err());
}

#[test]
fn test_emergency_stop_and_reset_fault_payload_round_trip() {
    let estop = EmergencyStopPayload {
        reason: Some("Collision risk".to_string()),
    };
    let serialized_estop = serde_json::to_string(&estop).expect("Serialize EmergencyStopPayload");
    let deserialized_estop: EmergencyStopPayload =
        serde_json::from_str(&serialized_estop).expect("Deserialize EmergencyStopPayload");
    assert_eq!(
        deserialized_estop.reason,
        Some("Collision risk".to_string())
    );

    let estop_empty: EmergencyStopPayload =
        serde_json::from_str("{}").expect("Deserialize empty EmergencyStopPayload");
    assert_eq!(estop_empty.reason, None);

    let reset: ResetFaultPayload =
        serde_json::from_str("{}").expect("Deserialize ResetFaultPayload");
    let serialized_reset = serde_json::to_string(&reset).expect("Serialize ResetFaultPayload");
    assert_eq!(serialized_reset, "{}");
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

#[test]
fn test_spawn_object_payload_serialization_round_trip() {
    let payload = SpawnObjectPayload {
        x: 0.5,
        y: -0.1,
        z: 0.0,
        object_type: SpawnObjectType::Gear,
    };
    let serialized = serde_json::to_string(&payload).expect("Serialize SpawnObjectPayload");
    assert!(serialized.contains(r#""object_type":"GEAR""#));
    assert!(serialized.contains(r#""x":0.5"#));

    let deserialized: SpawnObjectPayload =
        serde_json::from_str(&serialized).expect("Deserialize SpawnObjectPayload");
    assert_eq!(payload, deserialized);

    // Invalid object_type
    let invalid_json = json!({
        "x": 0.5,
        "y": 0.0,
        "z": 0.0,
        "object_type": "UNKNOWN",
    })
    .to_string();
    let result: Result<SpawnObjectPayload, _> = serde_json::from_str(&invalid_json);
    assert!(
        result.is_err(),
        "Expected deserialization error on unknown object_type"
    );

    // Extra fields rejected (deny_unknown_fields)
    let extra_json = json!({
        "x": 0.5,
        "y": 0.0,
        "z": 0.0,
        "object_type": "GEAR",
        "extra": true,
    })
    .to_string();
    assert!(serde_json::from_str::<SpawnObjectPayload>(&extra_json).is_err());

    // Command wrapper
    let cmd = RobotCommand {
        command_id: "a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d".to_string(),
        sender_id: "ui-client".to_string(),
        timestamp_ns: 1_725_894_942_000_000_000,
        r#type: CommandType::SpawnObject,
        payload: serde_json::to_value(&payload).expect("payload to value"),
    };
    let cmd_json = serde_json::to_string(&cmd).expect("Serialize SpawnObject command");
    let cmd_deserialized: RobotCommand =
        serde_json::from_str(&cmd_json).expect("Deserialize SpawnObject command");
    assert_eq!(cmd_deserialized.r#type, CommandType::SpawnObject);
}

#[test]
fn test_clear_workspace_payload_round_trip() {
    let payload = ClearWorkspacePayload::default();
    let serialized = serde_json::to_string(&payload).expect("Serialize ClearWorkspacePayload");
    assert_eq!(serialized, "{}");

    let deserialized: ClearWorkspacePayload =
        serde_json::from_str("{}").expect("Deserialize ClearWorkspacePayload");
    assert_eq!(payload, deserialized);

    // Extra fields rejected (deny_unknown_fields)
    let extra_json = json!({ "unexpected": "field" }).to_string();
    assert!(serde_json::from_str::<ClearWorkspacePayload>(&extra_json).is_err());

    // Command wrapper
    let cmd = RobotCommand {
        command_id: "a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d".to_string(),
        sender_id: "ui-client".to_string(),
        timestamp_ns: 1_725_894_942_000_000_000,
        r#type: CommandType::ClearWorkspace,
        payload: serde_json::to_value(&payload).expect("payload to value"),
    };
    let cmd_json = serde_json::to_string(&cmd).expect("Serialize ClearWorkspace command");
    let cmd_deserialized: RobotCommand =
        serde_json::from_str(&cmd_json).expect("Deserialize ClearWorkspace command");
    assert_eq!(cmd_deserialized.r#type, CommandType::ClearWorkspace);
}

#[test]
fn test_pick_and_place_target_payload_round_trip() {
    let payload = PickAndPlaceTargetPayload {
        pick_x: 0.5,
        pick_y: -0.1,
        pick_z: 0.0,
        drop_x: Some(0.4),
        drop_y: Some(-0.3),
        drop_z: Some(0.02),
    };
    let serialized = serde_json::to_string(&payload).expect("Serialize PickAndPlaceTargetPayload");
    assert!(serialized.contains(r#""pick_x":0.5"#));
    assert!(serialized.contains(r#""drop_x":0.4"#));

    let deserialized: PickAndPlaceTargetPayload =
        serde_json::from_str(&serialized).expect("Deserialize PickAndPlaceTargetPayload");
    assert_eq!(payload, deserialized);

    // Pick-only payload with None drop coordinates
    let payload_pick_only = PickAndPlaceTargetPayload {
        pick_x: 0.45,
        pick_y: 0.15,
        pick_z: 0.0,
        drop_x: None,
        drop_y: None,
        drop_z: None,
    };
    let serialized_pick_only =
        serde_json::to_string(&payload_pick_only).expect("Serialize pick-only payload");
    assert!(!serialized_pick_only.contains("drop_x"));
    let deserialized_pick_only: PickAndPlaceTargetPayload =
        serde_json::from_str(&serialized_pick_only).expect("Deserialize pick-only payload");
    assert_eq!(payload_pick_only, deserialized_pick_only);

    // Missing required field (pick_z missing)
    let missing_field_json = json!({
        "pick_x": 0.5,
        "pick_y": -0.1
    })
    .to_string();
    let result: Result<PickAndPlaceTargetPayload, _> = serde_json::from_str(&missing_field_json);
    assert!(
        result.is_err(),
        "Expected deserialization error on missing pick_z"
    );

    // Extra fields rejected (deny_unknown_fields)
    let extra_json = json!({
        "pick_x": 0.5,
        "pick_y": -0.1,
        "pick_z": 0.0,
        "unexpected_key": 42
    })
    .to_string();
    assert!(serde_json::from_str::<PickAndPlaceTargetPayload>(&extra_json).is_err());

    // Command wrapper
    let cmd = RobotCommand {
        command_id: "a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d".to_string(),
        sender_id: "ui-client".to_string(),
        timestamp_ns: 1_725_894_942_000_000_000,
        r#type: CommandType::PickAndPlaceTarget,
        payload: serde_json::to_value(&payload).expect("payload to value"),
    };
    let cmd_json = serde_json::to_string(&cmd).expect("Serialize PickAndPlaceTarget command");
    let cmd_deserialized: RobotCommand =
        serde_json::from_str(&cmd_json).expect("Deserialize PickAndPlaceTarget command");
    assert_eq!(cmd_deserialized.r#type, CommandType::PickAndPlaceTarget);
}

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
    assert_eq!(deserialized.workcell_state.active_id.as_deref(), Some("gear-1"));

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
            }],
            in_progress: vec![gateway::domain::GearEntry {
                id: "gear-1".to_string(),
                x: 0.45,
                y: 0.10,
                z: 0.0,
                origin_x: Some(0.45),
                origin_y: Some(0.10),
                origin_z: Some(0.0),
            }],
            processed: vec![gateway::domain::GearEntry {
                id: "gear-2".to_string(),
                x: 0.4,
                y: -0.3,
                z: 0.02,
                origin_x: Some(0.5),
                origin_y: Some(0.15),
                origin_z: Some(0.0),
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
    assert_eq!(deserialized.workcell_state.in_progress[0].origin_x, Some(0.45));
    assert_eq!(deserialized.workcell_state.processed[0].origin_y, Some(0.15));
}
