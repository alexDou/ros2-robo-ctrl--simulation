use gateway::domain::{
    ClearWorkspacePayload, CommandType, RobotCommand, SpawnObjectPayload, SpawnObjectType,
};
use serde_json::json;

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
