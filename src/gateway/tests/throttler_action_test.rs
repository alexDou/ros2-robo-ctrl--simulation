#![allow(
    clippy::as_conversions,
    clippy::cast_precision_loss,
    clippy::suboptimal_flops,
    clippy::items_after_statements
)]

use actix_web::{web, App, HttpServer};
use futures_util::{SinkExt, StreamExt};
use gateway::action::{ActionFeedbackFrame, ActionPoint, PickAndPlaceFeedback, PickAndPlaceGoal};
use gateway::domain::{CommandType, PalmState, RobotCommand, RobotState, RobotTelemetryEvent};
use gateway::throttler::TelemetryThrottler;
use gateway::{teleop_ws, ActiveSessionRegistry, DataFabricPort};
use std::time::Duration;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

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

#[tokio::test]
async fn test_telemetry_throttler_preserves_phase() {
    // Unit 6.6.7/4ixr: push_event passthrough carries phase to 30 Hz out.
    let throttler = TelemetryThrottler::new();
    let mut rx = throttler.subscribe();
    let event = RobotTelemetryEvent {
        timestamp_ns: 1_700_000_000_000_000_000,
        robot_state: RobotState::Executing,
        joint_positions: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        palm_state: gateway::domain::PalmState::default(),
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
    throttler.push_event(event);
    let out = tokio::time::timeout(Duration::from_millis(500), rx.recv())
        .await
        .expect("throttled frame")
        .expect("channel open");
    assert_eq!(out.phase.as_deref(), Some("RELEASING"));
    throttler.stop();
}

#[tokio::test]
async fn test_telemetry_throttler_500hz_to_30hz_stability() {
    let throttler = TelemetryThrottler::new();
    let mut rx = throttler.subscribe();

    // Spawn 500 Hz telemetry producer (1 sample every 2ms)
    let throttler_feed = throttler.clone();
    let feeder_handle = tokio::spawn(async move {
        let mut ticker = tokio::time::interval(Duration::from_millis(2));
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        for i in 0..400 {
            ticker.tick().await;
            let event = RobotTelemetryEvent {
                timestamp_ns: 1_700_000_000_000_000_000 + (i * 2_000_000),
                robot_state: RobotState::Executing,
                joint_positions: [i as f64 * 0.001, 0.0, 0.0, 0.0, 0.0, 0.0],
                palm_state: gateway::domain::PalmState::default(),
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
            throttler_feed.push_event(event);
        }
    });

    // Warm up: wait for first throttled frame to establish steady-state before timing
    let _ = rx.recv().await;

    let mut count = 0;
    let start = std::time::Instant::now();
    let target_duration = Duration::from_millis(600);

    while start.elapsed() < target_duration {
        match tokio::time::timeout(Duration::from_millis(60), rx.recv()).await {
            Ok(Ok(_event)) => {
                count += 1;
            }
            Ok(Err(_)) => break,
            Err(_) => {
                if feeder_handle.is_finished() {
                    break;
                }
            }
        }
    }

    let elapsed_sec = start.elapsed().as_secs_f64();
    let effective_hz = f64::from(count) / elapsed_sec;

    let _ = feeder_handle.await;
    throttler.stop();

    println!("Throttler received {count} frames in {elapsed_sec:.3}s (rate: {effective_hz:.2} Hz)");
    // Acceptance criterion: 30 Hz decimation rate stability (30 ± 2 Hz nominal)
    assert!(
        (27.0..=33.0).contains(&effective_hz),
        "Expected effective decimation rate 30 ± 3 Hz under test load, got {effective_hz:.2} Hz ({count} frames in {elapsed_sec:.3}s)"
    );
}

#[tokio::test]
async fn test_telemetry_throttler_5hz_slow_upstream_no_repeat() {
    // Sim loop runs 5 Hz (hand-sim-h7tu); throttler ticks 30 Hz.
    // Worker takes pending per tick, so slow upstream must pass through
    // at ~5 Hz with zero duplicate frames (emitted <= ingested).
    let throttler = TelemetryThrottler::new();
    let mut rx = throttler.subscribe();

    let throttler_feed = throttler.clone();
    let feeder_handle = tokio::spawn(async move {
        let mut ticker = tokio::time::interval(Duration::from_millis(200));
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        for i in 0..10 {
            ticker.tick().await;
            let event = RobotTelemetryEvent {
                timestamp_ns: 1_700_000_000_000_000_000 + (i * 200_000_000),
                robot_state: RobotState::Idle,
                joint_positions: [i as f64 * 0.01, 0.0, 0.0, 0.0, 0.0, 0.0],
                palm_state: gateway::domain::PalmState::default(),
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
            throttler_feed.push_event(event);
        }
    });

    let mut stamps = Vec::new();
    let start = std::time::Instant::now();
    while start.elapsed() < Duration::from_millis(2500) {
        match tokio::time::timeout(Duration::from_millis(300), rx.recv()).await {
            Ok(Ok(event)) => stamps.push(event.timestamp_ns),
            Ok(Err(_)) => break,
            Err(_) => {
                if feeder_handle.is_finished() && start.elapsed() > Duration::from_millis(2200)
                {
                    break;
                }
            }
        }
    }

    let _ = feeder_handle.await;
    let ingested = throttler.ingested_count();
    let emitted = throttler.emitted_count();
    throttler.stop();

    println!("Slow upstream: ingested={ingested} emitted={} frames", stamps.len());
    assert_eq!(ingested, 10, "feeder pushed exactly 10 frames");
    assert_eq!(stamps.len(), 10, "each upstream frame emitted exactly once");
    assert!(emitted <= ingested, "no duplicate emits: {emitted} <= {ingested}");
    let mut sorted = stamps.clone();
    sorted.sort_unstable();
    sorted.dedup();
    assert_eq!(sorted.len(), stamps.len(), "zero duplicate timestamps");
    let elapsed_sec = start.elapsed().as_secs_f64();
    let effective_hz = stamps.len() as f64 / elapsed_sec;
    assert!(
        (3.0..=8.0).contains(&effective_hz),
        "Expected ~5 Hz passthrough, got {effective_hz:.2} Hz"
    );
}

#[tokio::test]
async fn test_telemetry_throttler_raw_joint_states_ingestion() {
    let throttler = TelemetryThrottler::new();

    // Raw ROS 2 sensor_msgs/msg/JointState JSON
    let raw_joint_state_json = r#"{
        "name": [
            "shoulder_pan_joint",
            "shoulder_lift_joint",
            "elbow_joint",
            "wrist_1_joint",
            "wrist_2_joint",
            "wrist_3_joint",
            "extraneous_gripper_joint"
        ],
        "position": [0.15, -1.25, 1.45, -1.85, -1.57, 0.25, 0.08]
    }"#;

    throttler
        .push_raw(raw_joint_state_json)
        .expect("ingest raw joint states");

    let sampled = throttler
        .sample_latest()
        .expect("expected latest sample present");

    assert_eq!(sampled.robot_state, RobotState::Idle);
    assert!((sampled.joint_positions[0] - 0.15).abs() < 1e-6);
    assert!((sampled.joint_positions[1] - (-1.25)).abs() < 1e-6);
    assert!((sampled.joint_positions[2] - 1.45).abs() < 1e-6);
    assert!((sampled.joint_positions[3] - (-1.85)).abs() < 1e-6);
    assert!((sampled.joint_positions[4] - (-1.57)).abs() < 1e-6);
    assert!((sampled.joint_positions[5] - 0.25).abs() < 1e-6);

    // Dynamic state mutation
    throttler.set_robot_state(RobotState::Executing);
    let updated = throttler
        .sample_latest()
        .expect("expected updated sample present");
    assert_eq!(updated.robot_state, RobotState::Executing);

    throttler.stop();
}

#[tokio::test]
async fn test_telemetry_throttler_cdr_joint_states_ingestion() {
    let throttler = TelemetryThrottler::new();

    // Raw ROS 2 sensor_msgs/msg/JointState in OMG-CDR format (serialized by rclpy / ros2_control)
    let hex_cdr = concat!(
        "00010000", // CDR LE header
        "00f1536515cd5b07", // stamp: sec=1700000000, nanosec=123456789
        "0a000000626173655f6c696e6b000235", // frame_id: "base_link" + padding
        "06000000", // 6 joint names
        "1300000073686f756c6465725f70616e5f6a6f696e740000",
        "1400000073686f756c6465725f6c6966745f6a6f696e7400",
        "0c000000656c626f775f6a6f696e7400",
        "0e00000077726973745f315f6a6f696e74000235",
        "0e00000077726973745f325f6a6f696e74000000",
        "0e00000077726973745f335f6a6f696e74001030",
        "0600000070160435", // 6 positions + alignment padding
        "9a9999999999b93f", // 0.1
        "1f85eb51b81ef9bf", // -1.57
        "1f85eb51b81ef93f", // 1.57
        "1f85eb51b81ef9bf", // -1.57
        "1f85eb51b81ef9bf", // -1.57
        "0000000000000000", // 0.0
        "0600000070d80235", // 6 velocities (zeros)
        "000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
        "060000008098b300", // 6 efforts (zeros)
        "000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
    );

    let cdr_bytes = (0..hex_cdr.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&hex_cdr[i..i + 2], 16).expect("valid hex byte"))
        .collect::<Vec<u8>>();

    // Initial state check
    throttler.set_robot_state(RobotState::Idle);
    throttler.set_palm_state(gateway::domain::PalmState { is_grasped: true });

    throttler
        .push_bytes(&cdr_bytes)
        .expect("ingest binary CDR joint states");

    let sampled = throttler
        .sample_latest()
        .expect("expected latest sample present");

    assert_eq!(sampled.robot_state, RobotState::Idle);
    assert!(sampled.palm_state.is_grasped);
    assert_eq!(sampled.timestamp_ns, 1_700_000_000_123_456_789);

    assert!((sampled.joint_positions[0] - 0.1).abs() < 1e-4);
    assert!((sampled.joint_positions[1] - (-1.57)).abs() < 1e-4);
    assert!((sampled.joint_positions[2] - 1.57).abs() < 1e-4);
    assert!((sampled.joint_positions[3] - (-1.57)).abs() < 1e-4);
    assert!((sampled.joint_positions[4] - (-1.57)).abs() < 1e-4);
    assert!((sampled.joint_positions[5] - 0.0).abs() < 1e-4);

    throttler.stop();
}

#[tokio::test]
async fn test_telemetry_throttler_500hz_cdr_to_30hz_json_decimation() {
    let throttler = TelemetryThrottler::new();
    let mut rx_json = throttler.subscribe_json();

    // Raw ROS 2 sensor_msgs/msg/JointState in OMG-CDR format
    let hex_cdr = concat!(
        "00010000",                         // CDR LE header
        "00f1536515cd5b07",                 // stamp: sec=1700000000, nanosec=123456789
        "0a000000626173655f6c696e6b000235", // frame_id: "base_link" + padding
        "06000000",                         // 6 joint names
        "1300000073686f756c6465725f70616e5f6a6f696e740000",
        "1400000073686f756c6465725f6c6966745f6a6f696e7400",
        "0c000000656c626f775f6a6f696e7400",
        "0e00000077726973745f315f6a6f696e74000235",
        "0e00000077726973745f325f6a6f696e74000000",
        "0e00000077726973745f335f6a6f696e74001030",
        "0600000070160435", // 6 positions + alignment padding
        "9a9999999999b93f", // 0.1
        "1f85eb51b81ef9bf", // -1.57
        "1f85eb51b81ef93f", // 1.57
        "1f85eb51b81ef9bf", // -1.57
        "1f85eb51b81ef9bf", // -1.57
        "0000000000000000"  // 0.0
    );

    let cdr_bytes = (0..hex_cdr.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&hex_cdr[i..i + 2], 16).expect("valid hex byte"))
        .collect::<Vec<u8>>();

    throttler.set_robot_state(RobotState::Idle);

    // Spawn 500 Hz CDR producer (1 sample every 2ms)
    let throttler_feed = throttler.clone();
    let bytes_feed = cdr_bytes.clone();
    let feeder_handle = tokio::spawn(async move {
        let mut ticker = tokio::time::interval(Duration::from_millis(2));
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        for i in 0..400 {
            ticker.tick().await;
            if i == 200 {
                throttler_feed.set_robot_state(RobotState::Executing);
            }
            let _ = throttler_feed.push_bytes(&bytes_feed);
        }
    });

    // Warm up
    let _ = rx_json.recv().await;

    let mut count = 0;
    let mut observed_executing = false;
    let start = std::time::Instant::now();
    let target_duration = Duration::from_millis(600);

    while start.elapsed() < target_duration {
        match tokio::time::timeout(Duration::from_millis(60), rx_json.recv()).await {
            Ok(Ok(json_str)) => {
                count += 1;
                let event: RobotTelemetryEvent =
                    serde_json::from_str(&json_str).expect("valid json event");
                assert!((event.joint_positions[0] - 0.1).abs() < 1e-4);
                if event.robot_state == RobotState::Executing {
                    observed_executing = true;
                }
            }
            Ok(Err(_)) => break,
            Err(_) => {
                if feeder_handle.is_finished() {
                    break;
                }
            }
        }
    }

    let elapsed_sec = start.elapsed().as_secs_f64();
    let effective_hz = f64::from(count) / elapsed_sec;

    let _ = feeder_handle.await;
    throttler.stop();

    assert!(
        observed_executing,
        "Expected dynamic robot_state Executing mutation to propagate into emitted JSON"
    );
    assert!(
        (25.0..=35.0).contains(&effective_hz),
        "Expected effective decimation rate 30 ± 5 Hz under test load, got {effective_hz:.2} Hz ({count} frames in {elapsed_sec:.3}s)"
    );
}

#[tokio::test]
async fn test_ws_pick_and_place_translates_to_action_and_relays_feedback() {
    let registry = web::Data::new(ActiveSessionRegistry::default());
    let fabric = web::Data::new(DataFabricPort::memory());

    let reg_clone = registry.clone();
    let fab_clone = fabric.clone();

    let server = HttpServer::new(move || {
        App::new()
            .app_data(reg_clone.clone())
            .app_data(fab_clone.clone())
            .route("/ws/teleop/robot/{id}", web::get().to(teleop_ws))
    })
    .bind(("127.0.0.1", 0))
    .expect("bind ephemeral port");

    let port = server.addrs()[0].port();
    let srv_handle = server.run();
    tokio::spawn(srv_handle);

    let ws_url = format!("ws://127.0.0.1:{port}/ws/teleop/robot/robot-action-test");
    let (mut ws_stream, _) = connect_async(&ws_url)
        .await
        .expect("WebSocket connection handshake failed");

    assert!(registry.is_active("robot-action-test"));

    // Subscribe to action goal on fabric
    let mut goal_rx = fabric
        .subscribe_action_goal("robot-action-test")
        .expect("subscribe action goal");

    // 1. Send valid PICK_AND_PLACE_TARGET frame over WebSocket
    let pnp_cmd = RobotCommand {
        command_id: "cmd-pnp-action-42".to_string(),
        sender_id: "test-teleop-client".to_string(),
        timestamp_ns: 1_700_000_000_000_000_000,
        r#type: CommandType::PickAndPlaceTarget,
        payload: serde_json::json!({
            "pick_x": 0.35,
            "pick_y": 0.15,
            "pick_z": 0.02,
            "drop_x": 0.40,
            "drop_y": -0.30,
            "drop_z": 0.08
        }),
    };
    ws_stream
        .send(Message::Text(
            serde_json::to_string(&pnp_cmd).expect("serialize pnp_cmd"),
        ))
        .await
        .expect("send PICK_AND_PLACE_TARGET");

    // 2. Assert translated PickAndPlaceGoal received on fabric
    let received_goal = tokio::time::timeout(Duration::from_millis(500), goal_rx.recv())
        .await
        .expect("timed out waiting for action goal")
        .expect("goal rx");

    assert_eq!(received_goal.command_id, "cmd-pnp-action-42");
    assert!(received_goal.use_custom_drop);
    assert!((received_goal.pick_coords.x - 0.35).abs() < 1e-6);
    assert!((received_goal.pick_coords.y - 0.15).abs() < 1e-6);
    assert!((received_goal.pick_coords.z - 0.02).abs() < 1e-6);
    assert!((received_goal.drop_coords.x - 0.40).abs() < 1e-6);
    assert!((received_goal.drop_coords.y - (-0.30)).abs() < 1e-6);
    assert!((received_goal.drop_coords.z - 0.08).abs() < 1e-6);

    // 3. Emit ActionFeedbackFrame onto fabric, verify client receives it over WebSocket
    let feedback_frame =
        ActionFeedbackFrame::new("cmd-pnp-action-42", "TRANSFERRING", 60.0, 1_700_000_000_100);
    fabric
        .publish_action_feedback("robot-action-test", &feedback_frame)
        .await
        .expect("publish action feedback");

    let client_msg = tokio::time::timeout(Duration::from_millis(500), ws_stream.next())
        .await
        .expect("timed out waiting for feedback frame")
        .expect("ws stream open")
        .expect("msg ok");

    match client_msg {
        Message::Text(txt) => {
            let received_fb: ActionFeedbackFrame =
                serde_json::from_str(&txt).expect("parse action feedback frame");
            assert_eq!(received_fb.r#type, "ACTION_FEEDBACK");
            assert_eq!(received_fb.command_id, "cmd-pnp-action-42");
            assert_eq!(received_fb.phase, "TRANSFERRING");
            assert!((received_fb.percent_complete - 60.0).abs() < 1e-6);
        }
        other => panic!("expected text message, got {other:?}"),
    }

    drop(ws_stream);
    tokio::time::sleep(Duration::from_millis(50)).await;
    assert!(!registry.is_active("robot-action-test"));
}

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
    use gateway::domain::{GearEntry, WorkcellState};
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
        }],
        processed: vec![GearEntry {
            id: "gear-0".to_string(),
            x: 0.4,
            y: -0.3,
            z: 0.02,
            origin_x: Some(0.5),
            origin_y: Some(0.15),
            origin_z: Some(0.0),
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
