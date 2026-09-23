use actix_web::{web, App, HttpServer};
use gateway::domain::{CommandType, PalmState, RobotState, RobotTelemetryEvent};
use gateway::{teleop_ws, ActiveSessionRegistry, DataFabricPort};
use std::time::Duration;
use tokio_tungstenite::connect_async;

#[tokio::test]
async fn test_ws_handshake_retry_until_idle_and_standby_exactly_once() {
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

    let ws_url = format!("ws://127.0.0.1:{port}/ws/teleop/robot/robot-retry");
    let mut cmd_rx = fabric
        .subscribe_command("robot-retry")
        .expect("subscribe command");

    let (ws_stream, _) = connect_async(&ws_url)
        .await
        .expect("WebSocket connection handshake failed");

    // 1. Initial ENGAGE on connect
    let first = tokio::time::timeout(Duration::from_millis(2000), cmd_rx.recv())
        .await
        .expect("timed out waiting for initial ENGAGE")
        .expect("cmd rx");
    assert_eq!(first.r#type, CommandType::Engage);

    // 2. Arm still parked (STANDBY telemetry): gateway must retry ENGAGE
    let parked = RobotTelemetryEvent {
        timestamp_ns: 1_700_000_000_000_000_000,
        robot_state: RobotState::Standby,
        joint_positions: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        palm_state: PalmState::default(),
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
    fabric
        .publish_telemetry(
            "robot-retry",
            &serde_json::to_string(&parked).expect("serialize parked"),
        )
        .expect("publish parked telemetry");

    let retry = tokio::time::timeout(Duration::from_millis(1500), cmd_rx.recv())
        .await
        .expect("timed out waiting for ENGAGE retry while arm parked")
        .expect("cmd rx");
    assert_eq!(retry.r#type, CommandType::Engage);
    assert_ne!(retry.command_id, first.command_id);

    // 3. Arm leaves parked state (IDLE telemetry): retries must stop
    let idle = RobotTelemetryEvent {
        timestamp_ns: 1_700_000_000_000_000_001,
        robot_state: RobotState::Idle,
        joint_positions: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        palm_state: PalmState::default(),
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
    fabric
        .publish_telemetry(
            "robot-retry",
            &serde_json::to_string(&idle).expect("serialize idle"),
        )
        .expect("publish idle telemetry");

    // Grace for an in-flight retry, then drain stragglers and demand quiet
    tokio::time::sleep(Duration::from_millis(300)).await;
    while cmd_rx.try_recv().is_ok() {}
    tokio::time::sleep(Duration::from_millis(1200)).await;
    assert!(
        cmd_rx.try_recv().is_err(),
        "no ENGAGE retry after arm left parked state"
    );

    // 4. Disconnect publishes STANDBY exactly once
    drop(ws_stream);
    tokio::time::sleep(Duration::from_millis(300)).await;
    let mut standbys = 0;
    let mut others = 0;
    while let Ok(cmd) = cmd_rx.try_recv() {
        if cmd.r#type == CommandType::Standby {
            standbys += 1;
        } else {
            others += 1;
        }
    }
    assert_eq!(standbys, 1, "disconnect must publish STANDBY exactly once");
    assert_eq!(others, 0, "no ENGAGE retry after disconnect, got {others}");
}
