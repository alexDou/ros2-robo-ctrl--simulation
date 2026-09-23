use actix_web::{web, App, HttpServer};
use futures_util::StreamExt;
use gateway::domain::{PalmState, RobotState, RobotTelemetryEvent};
use gateway::{teleop_ws, ActiveSessionRegistry, DataFabricPort};
use std::time::Duration;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

#[tokio::test]
async fn test_ws_30hz_telemetry_high_throughput() {
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

    let ws_url = format!("ws://127.0.0.1:{port}/ws/teleop/robot/robot-30hz");
    let (mut ws_stream, _) = connect_async(&ws_url)
        .await
        .expect("WebSocket connection handshake failed");

    assert_eq!(fabric.active_telemetry_subscriptions("robot-30hz"), 1);

    // Stream 60 frames representing 2 seconds of 30 Hz telemetry
    const TOTAL_FRAMES: usize = 60;
    for i in 0..TOTAL_FRAMES {
        let telem_event = RobotTelemetryEvent {
            timestamp_ns: 1_700_000_000_000_000_000 + (i as u64 * 33_333_333),
            robot_state: RobotState::Idle,
            joint_positions: [i as f64 * 0.01, 0.0, 0.0, 0.0, 0.0, 0.0],
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
        let telem_json = serde_json::to_string(&telem_event).expect("serialize telemetry");
        fabric
            .publish_telemetry("robot-30hz", &telem_json)
            .expect("publish telemetry");
    }

    // Receive and assert all 60 frames without drop
    for i in 0..TOTAL_FRAMES {
        let msg = tokio::time::timeout(Duration::from_millis(2000), ws_stream.next())
            .await
            .unwrap_or_else(|_| panic!("timed out waiting for frame {i}"))
            .expect("ws stream open")
            .expect("msg ok");

        match msg {
            Message::Text(txt) => {
                let received: RobotTelemetryEvent =
                    serde_json::from_str(&txt).expect("parse telemetry event");
                assert!((received.joint_positions[0] - i as f64 * 0.01).abs() < 1e-6);
            }
            other => panic!("expected text message, got {other:?}"),
        }
    }

    drop(ws_stream);
    tokio::time::sleep(Duration::from_millis(100)).await;
    assert_eq!(fabric.active_telemetry_subscriptions("robot-30hz"), 0);
}
