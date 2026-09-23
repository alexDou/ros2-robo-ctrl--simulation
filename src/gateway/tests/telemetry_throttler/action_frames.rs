use gateway::action::{ActionFeedbackFrame, ActionPoint, PickAndPlaceFeedback, PickAndPlaceGoal};

#[test]
fn test_action_goal_and_feedback_serialization() {
    // 1. PickAndPlaceGoal JSON round-trip
    let goal = PickAndPlaceGoal {
        pick_coords: ActionPoint::new(0.35, 0.15, 0.02),
        drop_coords: ActionPoint::new(0.40, -0.30, 0.04),
        use_custom_drop: true,
        command_id: "cmd-pnp-101".to_string(),
    };
    let json = serde_json::to_string(&goal).expect("serialize goal");
    let deserialized: PickAndPlaceGoal = serde_json::from_str(&json).expect("deserialize goal");
    assert_eq!(goal, deserialized);
    assert!(json.contains("\"pick_coords\""));
    assert!(json.contains("\"drop_coords\""));
    assert!(json.contains("\"use_custom_drop\":true"));
    assert!(json.contains("\"command_id\":\"cmd-pnp-101\""));

    // 2. PickAndPlaceFeedback JSON round-trip
    let feedback = PickAndPlaceFeedback {
        phase: "APPROACHING".to_string(),
        percent_complete: 25.0,
    };
    let fb_json = serde_json::to_string(&feedback).expect("serialize feedback");
    let fb_deserialized: PickAndPlaceFeedback =
        serde_json::from_str(&fb_json).expect("deserialize feedback");
    assert_eq!(feedback, fb_deserialized);
    assert!(fb_json.contains("\"phase\":\"APPROACHING\""));
    assert!(fb_json.contains("\"percent_complete\":25.0"));

    // 3. ActionFeedbackFrame WebSocket progress frame round-trip
    let frame = ActionFeedbackFrame::new("cmd-pnp-101", "GRASPING", 50.0, 1_700_000_000_000);
    let frame_json = serde_json::to_string(&frame).expect("serialize action feedback frame");
    let frame_deserialized: ActionFeedbackFrame =
        serde_json::from_str(&frame_json).expect("deserialize action feedback frame");
    assert_eq!(frame, frame_deserialized);
    assert_eq!(frame_deserialized.r#type, "ACTION_FEEDBACK");
    assert_eq!(frame_deserialized.command_id, "cmd-pnp-101");
    assert_eq!(frame_deserialized.phase, "GRASPING");
    assert!((frame_deserialized.percent_complete - 50.0).abs() < 1e-6);
}
