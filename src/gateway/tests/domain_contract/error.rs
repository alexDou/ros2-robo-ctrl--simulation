use gateway::domain::ErrorFrame;

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
