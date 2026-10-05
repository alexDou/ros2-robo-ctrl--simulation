use gateway::domain::{
    BeltGear, CellFillPayload, CellProcessPayload, CellState, CellStopPayload, Color, CommandType,
    ConveyorStatus, ExchangeState, RobotCommand, StationName, StationStatus,
};
use serde_json::json;

#[test]
fn test_cell_command_types_round_trip() {
    for (wire, expected) in [
        ("CELL_FILL", CommandType::CellFill),
        ("CELL_PROCESS", CommandType::CellProcess),
        ("CELL_STOP", CommandType::CellStop),
    ] {
        let raw = json!({
            "command_id": "a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d",
            "sender_id": "ui-client",
            "timestamp_ns": 1_725_894_942_000_000_000u64,
            "type": wire,
            "payload": {},
        })
        .to_string();
        let cmd: RobotCommand = serde_json::from_str(&raw).expect("deserialize cell command");
        assert_eq!(cmd.r#type, expected);
        let again = serde_json::to_string(&cmd).expect("serialize cell command");
        assert!(again.contains(&format!(r#""type":"{wire}""#)));
    }
}

#[test]
fn test_cell_payloads_are_empty_and_strict() {
    assert_eq!(
        serde_json::to_string(&CellFillPayload::default()).expect("serialize empty payload"),
        "{}"
    );
    assert!(serde_json::from_str::<CellFillPayload>(r#"{"x":1}"#).is_err());
    assert_eq!(
        serde_json::to_string(&CellProcessPayload::default()).expect("serialize empty payload"),
        "{}"
    );
    assert_eq!(
        serde_json::to_string(&CellStopPayload::default()).expect("serialize empty payload"),
        "{}"
    );
    assert!(serde_json::from_str::<CellProcessPayload>(r#"{"x":1}"#).is_err());
    assert!(serde_json::from_str::<CellStopPayload>(r#"{"x":1}"#).is_err());
}

#[test]
fn test_cell_state_round_trip_and_strictness() {
    let state = CellState {
        conveyor_status: ConveyorStatus::Feeding,
        feeder_remaining: 100,
        belt_offset_m: 0.25,
        belt_gears: vec![BeltGear {
            id: "belt-1".to_string(),
            x: 0.4,
            y: 0.5,
            color: Color::Green,
            intact: false,
        }],
        stations: Some(vec![StationStatus {
            name: StationName::Green,
            exchange_state: ExchangeState::Away,
            count: 10,
        }]),
    };
    let text = serde_json::to_string(&state).expect("serialize CellState");
    assert!(text.contains(r#""conveyor_status":"FEEDING""#));
    assert!(text.contains(r#""exchange_state":"AWAY""#));
    let back: CellState = serde_json::from_str(&text).expect("deserialize CellState");
    assert_eq!(state, back);

    assert!(serde_json::from_str::<CellState>(
        r#"{"conveyor_status":"BOGUS","feeder_remaining":0,"belt_offset_m":0.0,"belt_gears":[]}"#
    )
    .is_err());
    assert!(serde_json::from_str::<CellState>(
        r#"{"conveyor_status":"EMPTY","belt_offset_m":0.0,"belt_gears":[]}"#
    )
    .is_err());
    assert!(serde_json::from_str::<CellState>(
        r#"{"conveyor_status":"EMPTY","feeder_remaining":0,"belt_offset_m":0.0}"#
    )
    .is_err());
}

#[test]
fn test_workcell_state_rejected_bucket_is_optional_and_strict() {
    use gateway::domain::WorkcellState;
    let entry = r#"{"id":"belt-2","x":0.4,"y":0.1,"z":0.0,"color":"BLUE","intact":false}"#;
    let with = format!(r#"{{"spawned":[],"in_progress":[],"processed":[],"rejected":[{entry}]}}"#);
    let state: WorkcellState = serde_json::from_str(&with).expect("rejected bucket");
    assert_eq!(state.rejected.as_ref().map(Vec::len), Some(1));
    let again = serde_json::to_string(&state).expect("serialize");
    assert!(again.contains(r#""rejected":[{"id":"belt-2""#));

    let without: WorkcellState =
        serde_json::from_str(r#"{"spawned":[],"in_progress":[],"processed":[]}"#)
            .expect("rejected is optional");
    assert!(without.rejected.is_none());
    assert!(!serde_json::to_string(&without)
        .expect("serialize")
        .contains("rejected"));

    let bad = with.replace("BLUE", "RED");
    assert!(serde_json::from_str::<WorkcellState>(&bad).is_err());
}
