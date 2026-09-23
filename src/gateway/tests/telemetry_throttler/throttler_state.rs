#![allow(
    clippy::as_conversions,
    clippy::cast_precision_loss,
    clippy::suboptimal_flops,
    clippy::items_after_statements
)]

use gateway::domain::{PalmState, RobotState, RobotTelemetryEvent};
use gateway::throttler::TelemetryThrottler;
use std::time::Duration;

#[tokio::test]
async fn test_telemetry_throttler_joint_bytes_preserve_authoritative_state() {
    // Unit 6.6.1: joint-bytes decimation after state set still emits
    // EXECUTING + grasped, never Idle/false flood.
    let throttler = TelemetryThrottler::new();
    let mut rx = throttler.subscribe();

    throttler.set_robot_state(RobotState::Executing);
    throttler.set_palm_state(PalmState { is_grasped: true });

    let raw_joint_state_json = r#"{
        "name": [
            "shoulder_pan_joint",
            "shoulder_lift_joint",
            "elbow_joint",
            "wrist_1_joint",
            "wrist_2_joint",
            "wrist_3_joint"
        ],
        "position": [0.1, -0.2, 0.3, -0.4, 0.5, -0.6]
    }"#;
    throttler
        .push_raw(raw_joint_state_json)
        .expect("ingest joint bytes");

    let event = tokio::time::timeout(Duration::from_millis(500), rx.recv())
        .await
        .expect("emitted frame")
        .expect("no lag");
    assert_eq!(event.robot_state, RobotState::Executing);
    assert!(event.palm_state.is_grasped);
    assert!((event.joint_positions[0] - 0.1).abs() < 1e-6);

    throttler.stop();
}

#[tokio::test]
async fn test_telemetry_throttler_preserves_workcell_snapshot_verbatim() {
    // Unit 6.7.4: throttler holds + re-emits workcell_state on synthesized
    // paths (same pattern as phase); coords verbatim incl origin.
    use gateway::domain::{GearColor, GearEntry, WorkcellState};
    let throttler = TelemetryThrottler::new();
    let mut rx = throttler.subscribe();
    let snapshot = WorkcellState {
        spawned: Vec::new(),
        in_progress: vec![GearEntry {
            id: "gear-1".to_string(),
            x: 0.45,
            y: 0.10,
            z: 0.0,
            origin_x: Some(0.45),
            origin_y: Some(0.10),
            origin_z: Some(0.0),
            color: GearColor::White,
            intact: true,
        }],
        processed: vec![GearEntry {
            id: "gear-0".to_string(),
            x: 0.4,
            y: -0.3,
            z: 0.02,
            origin_x: Some(0.5),
            origin_y: Some(0.15),
            origin_z: Some(0.0),
            color: GearColor::White,
            intact: true,
        }],
        active_id: Some("gear-1".to_string()),
    };
    let event = RobotTelemetryEvent {
        timestamp_ns: 1_700_000_000_000_000_000,
        robot_state: RobotState::Executing,
        joint_positions: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        palm_state: gateway::domain::PalmState::default(),
        inference_metrics: None,
        command_id: None,
        workcell_state: snapshot.clone(),
        phase: Some("GRASPING".to_string()),
    };
    throttler.push_event(event);
    let out = tokio::time::timeout(Duration::from_millis(500), rx.recv())
        .await
        .expect("throttled frame")
        .expect("channel open");
    assert_eq!(out.workcell_state, snapshot);
    assert_eq!(out.workcell_state.in_progress[0].origin_x, Some(0.45));
    assert_eq!(out.workcell_state.processed[0].origin_y, Some(0.15));
    assert_eq!(out.workcell_state.active_id.as_deref(), Some("gear-1"));

    // Synthesized CDR path re-emits held snapshot (joints refresh, buckets kept).
    let hex_cdr = concat!(
        "00010000",
        "00f1536515cd5b07",
        "0a000000626173655f6c696e6b000235",
        "06000000",
        "1300000073686f756c6465725f70616e5f6a6f696e740000",
        "1400000073686f756c6465725f6c6966745f6a6f696e7400",
        "0c000000656c626f775f6a6f696e7400",
        "0e00000077726973745f315f6a6f696e74000235",
        "0e00000077726973745f325f6a6f696e74000000",
        "0e00000077726973745f335f6a6f696e74001030",
        "0600000070160435",
        "9a9999999999b93f",
        "1f85eb51b81ef9bf",
        "1f85eb51b81ef93f",
        "1f85eb51b81ef9bf",
        "1f85eb51b81ef9bf",
        "0000000000000000",
        "0600000070d80235",
        "000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
        "060000008098b300",
        "000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
    );
    let cdr_bytes = (0..hex_cdr.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&hex_cdr[i..i + 2], 16).expect("valid hex byte"))
        .collect::<Vec<u8>>();
    throttler.push_bytes(&cdr_bytes).expect("ingest CDR joints");
    let synth = throttler.sample_latest().expect("latest present");
    assert_eq!(synth.workcell_state, snapshot);
    assert!((synth.joint_positions[0] - 0.1).abs() < 1e-4);
    throttler.stop();
}
