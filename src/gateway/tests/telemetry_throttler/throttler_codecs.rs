#![allow(
    clippy::as_conversions,
    clippy::cast_precision_loss,
    clippy::suboptimal_flops,
    clippy::items_after_statements
)]

use gateway::domain::{RobotState, RobotTelemetryEvent};
use gateway::throttler::TelemetryThrottler;
use std::time::Duration;

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
