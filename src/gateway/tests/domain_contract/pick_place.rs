use gateway::domain::{CommandType, PickAndPlaceTargetPayload, RobotCommand};
use serde_json::json;

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
fn test_pick_and_place_payload_rejects_non_finite_json() {
    let overflow = r#"{"pick_x": 1e309, "pick_y": 0.1, "pick_z": 0.0}"#;
    assert!(serde_json::from_str::<PickAndPlaceTargetPayload>(overflow).is_err());
    let drop_overflow = r#"{"pick_x": 0.5, "pick_y": 0.1, "pick_z": 0.0, "drop_x": 1e309}"#;
    assert!(serde_json::from_str::<PickAndPlaceTargetPayload>(drop_overflow).is_err());
}
