use gateway::domain::{PoseName, TrajectoryExecutePayload};

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
