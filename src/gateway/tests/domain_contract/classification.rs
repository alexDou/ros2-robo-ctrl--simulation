#[test]
fn test_unit70_required_color_intact() {
    // Unit 8.0c/hand-sim-rmju: spawn carries the client's classification (required, no defaults);
    // GearEntry requires color + intact on every bucket, no defaults.
    use gateway::domain::{
        GearColor, GearEntry, RobotState, RobotTelemetryEvent, SpawnObjectPayload, SpawnObjectType,
        BELT_CAPACITY, BELT_X_RANGE, BELT_Y_RANGE, BLUE_TOWER, GREEN_TOWER, PALLET_CAPACITY,
        PICK_ZONE_Y_RANGE, SCRAP_BIN, STACK_STEP_M, WHITE_TOWER,
    };
    let payload = SpawnObjectPayload {
        x: 0.5,
        y: 0.0,
        z: 0.0,
        object_type: SpawnObjectType::Gear,
        color: GearColor::Blue,
        intact: true,
    };
    let wire = serde_json::to_string(&payload).expect("serialize");
    let restored: SpawnObjectPayload = serde_json::from_str(&wire).expect("deserialize");
    assert_eq!(payload, restored);

    // Classification is required on the spawn wire: missing or invalid values are rejected.
    let missing_intact: Result<SpawnObjectPayload, _> =
        serde_json::from_str(r#"{"x":0.5,"y":0.0,"z":0.0,"object_type":"GEAR","color":"WHITE"}"#);
    assert!(missing_intact.is_err());
    let missing_color: Result<SpawnObjectPayload, _> =
        serde_json::from_str(r#"{"x":0.5,"y":0.0,"z":0.0,"object_type":"GEAR","intact":true}"#);
    assert!(missing_color.is_err());
    let bad_color: Result<SpawnObjectPayload, _> = serde_json::from_str(
        r#"{"x":0.5,"y":0.0,"z":0.0,"object_type":"GEAR","color":"RED","intact":true}"#,
    );
    assert!(bad_color.is_err());

    // Invalid color rejected on GearEntry; missing fields rejected (no defaults).
    let bad: Result<GearEntry, _> =
        serde_json::from_str(r#"{"id":"g0","x":0.1,"y":0.1,"z":0.0,"color":"RED","intact":true}"#);
    assert!(bad.is_err());
    let missing: Result<GearEntry, _> =
        serde_json::from_str(r#"{"id":"g0","x":0.1,"y":0.1,"z":0.0}"#);
    assert!(missing.is_err());

    for color in [GearColor::White, GearColor::Green, GearColor::Blue] {
        for intact in [false, true] {
            let g = GearEntry {
                id: "g0".to_string(),
                x: 0.1,
                y: 0.1,
                z: 0.0,
                color,
                intact,
                origin_x: None,
                origin_y: None,
                origin_z: None,
            };
            let w = serde_json::to_string(&g).expect("serialize");
            let r: GearEntry = serde_json::from_str(&w).expect("deserialize");
            assert_eq!(g, r);
        }
    }

    // Every bucket parses classified entries.
    let event: RobotTelemetryEvent = serde_json::from_str(
        r#"{"timestamp_ns":1,"robot_state":"IDLE","joint_positions":[0.0,0.0,0.0,0.0,0.0,0.0],"workcell_state":{"spawned":[{"id":"g0","x":0.1,"y":0.1,"z":0.0,"color":"WHITE","intact":true}],"in_progress":[{"id":"g1","x":0.1,"y":0.1,"z":0.0,"color":"GREEN","intact":false}],"processed":[{"id":"g2","x":0.4,"y":-0.3,"z":0.02,"color":"BLUE","intact":true}]}}"#,
    )
    .expect("event deserialize");
    assert_eq!(event.workcell_state.spawned[0].color, GearColor::White);
    assert!(event.workcell_state.spawned[0].intact);
    assert_eq!(event.workcell_state.in_progress[0].color, GearColor::Green);
    assert!(!event.workcell_state.in_progress[0].intact);
    assert_eq!(event.workcell_state.processed[0].color, GearColor::Blue);
    assert!(event.workcell_state.processed[0].intact);
    let _ = RobotState::Idle;

    #[allow(clippy::float_cmp)] // comparing codegen literals for exactness, not computed values
    {
        assert_eq!(WHITE_TOWER, [-0.45, -0.26, 0.0]);
        assert_eq!(GREEN_TOWER, [-0.45, -0.10, 0.0]);
        assert_eq!(BLUE_TOWER, [-0.45, 0.06, 0.0]);
        assert_eq!(SCRAP_BIN, [0.4, -0.75, -0.05]);
        assert_eq!(BELT_X_RANGE, [0.25, 0.55]);
        assert_eq!(BELT_Y_RANGE, [-0.66, 0.95]);
        assert_eq!(PICK_ZONE_Y_RANGE, [-0.51, 0.51]);
    }
    assert_eq!(PALLET_CAPACITY, 10);
    assert_eq!(BELT_CAPACITY, 10);
    assert!((STACK_STEP_M - 0.02).abs() < 1e-12);
}
