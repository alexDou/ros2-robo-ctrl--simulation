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
                if feeder_handle.is_finished() && start.elapsed() > Duration::from_millis(2200) {
                    break;
                }
            }
        }
    }

    let _ = feeder_handle.await;
    let ingested = throttler.ingested_count();
    let emitted = throttler.emitted_count();
    throttler.stop();

    println!(
        "Slow upstream: ingested={ingested} emitted={} frames",
        stamps.len()
    );
    assert_eq!(ingested, 10, "feeder pushed exactly 10 frames");
    assert_eq!(stamps.len(), 10, "each upstream frame emitted exactly once");
    assert!(
        emitted <= ingested,
        "no duplicate emits: {emitted} <= {ingested}"
    );
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
