use gateway::domain::{EmergencyStopPayload, ResetFaultPayload};

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
