#![allow(
    clippy::as_conversions,
    clippy::cast_precision_loss,
    clippy::suboptimal_flops,
    clippy::items_after_statements
)]

use std::time::Duration;
use actix_web::{test, web, App, HttpServer};
use futures_util::{SinkExt, StreamExt};
use gateway::domain::{
    CommandType, ErrorFrame, PalmState, RobotCommand, RobotState, RobotTelemetryEvent,
};
use gateway::{teleop_ws, ActiveSessionRegistry, DataFabricPort};
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;


#[actix_web::test]
async fn test_ws_handshake_success_and_conflict_rejection() {
    let registry = web::Data::new(ActiveSessionRegistry::default());
    let fabric = web::Data::new(DataFabricPort::memory());

    let app = test::init_service(
        App::new()
            .app_data(registry.clone())
            .app_data(fabric.clone())
            .route("/ws/teleop/robot/{id}", web::get().to(teleop_ws)),
    )
    .await;

    // First request: valid handshake
    let req1 = test::TestRequest::get()
        .uri("/ws/teleop/robot/robot-0")
        .insert_header(("connection", "upgrade"))
        .insert_header(("upgrade", "websocket"))
        .insert_header(("sec-websocket-version", "13"))
        .insert_header(("sec-websocket-key", "dGhlIHNhbXBsZSBub25jZQ=="))
        .to_request();

    let resp1 = test::call_service(&app, req1).await;
    assert_eq!(resp1.status(), actix_web::http::StatusCode::SWITCHING_PROTOCOLS);

    // Second request while first is active: 409 Conflict
    let req2 = test::TestRequest::get()
        .uri("/ws/teleop/robot/robot-0")
        .insert_header(("connection", "upgrade"))
        .insert_header(("upgrade", "websocket"))
        .insert_header(("sec-websocket-version", "13"))
        .insert_header(("sec-websocket-key", "dGhlIHNhbXBsZSBub25jZQ=="))
        .to_request();

    let resp2 = test::call_service(&app, req2).await;
    assert_eq!(resp2.status(), actix_web::http::StatusCode::CONFLICT);

    // Invalid robot ID: 400 Bad Request
    let req3 = test::TestRequest::get()
        .uri("/ws/teleop/robot/robot%2Finvalid")
        .insert_header(("connection", "upgrade"))
        .insert_header(("upgrade", "websocket"))
        .insert_header(("sec-websocket-version", "13"))
        .insert_header(("sec-websocket-key", "dGhlIHNhbXBsZSBub25jZQ=="))
        .to_request();

    let resp3 = test::call_service(&app, req3).await;
    assert_eq!(resp3.status(), actix_web::http::StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn test_ws_end_to_end_messaging_and_session_lifecycle() {
    let registry = web::Data::new(ActiveSessionRegistry::default());
    let fabric = web::Data::new(DataFabricPort::memory());

    let reg_clone = registry.clone();
    let fab_clone = fabric.clone();

    // Start local ephemeral HTTP server
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

    let ws_url = format!("ws://127.0.0.1:{port}/ws/teleop/robot/robot-1");

    // Connect WS client
    let (mut ws_stream, _) = connect_async(&ws_url)
        .await
        .expect("WebSocket connection handshake failed");

    // Verify session is active
    assert!(registry.is_active("robot-1"));

    // Subscribe to fabric command topic to verify forwarded command
    let mut cmd_rx = fabric
        .subscribe_command("robot-1")
        .expect("subscribe command");

    // 1. Send valid PING command
    let ping_cmd = RobotCommand {
        command_id: "cmd-1234".to_string(),
        sender_id: "test-client".to_string(),
        timestamp_ns: 1_700_000_000_000_000_000,
        r#type: CommandType::Ping,
        payload: serde_json::json!({}),
    };
    let ping_json = serde_json::to_string(&ping_cmd).expect("serialize ping");
    ws_stream
        .send(Message::Text(ping_json.clone()))
        .await
        .expect("send ping");

    // Assert fabric received command
    let received_cmd = tokio::time::timeout(Duration::from_millis(500), cmd_rx.recv())
        .await
        .expect("timed out waiting for command")
        .expect("cmd rx");
    assert_eq!(received_cmd.command_id, "cmd-1234");
    assert_eq!(received_cmd.r#type, CommandType::Ping);

    // 2. Send malformed command frame
    ws_stream
        .send(Message::Text("invalid JSON payload".to_string()))
        .await
        .expect("send malformed frame");

    // Expect ERROR frame back on WS without connection closing
    let error_msg = tokio::time::timeout(Duration::from_millis(500), ws_stream.next())
        .await
        .expect("timed out waiting for error frame")
        .expect("ws next")
        .expect("msg ok");

    match error_msg {
        Message::Text(txt) => {
            let err_frame: ErrorFrame = serde_json::from_str(&txt).expect("parse error frame");
            assert_eq!(err_frame.r#type, "ERROR");
            assert_eq!(err_frame.error_code, "SCHEMA_VALIDATION_ERROR");
        }
        other => panic!("expected text message with ERROR frame, got {other:?}"),
    }

    // 3. Publish telemetry to fabric, expect client to receive it
    let telem_event = RobotTelemetryEvent {
        timestamp_ns: 1_700_000_000_000_000_000,
        robot_state: RobotState::Idle,
        joint_positions: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        palm_state: PalmState::default(),
        inference_metrics: None,
        command_id: Some("cmd-1234".to_string()),
    };
    let telem_json = serde_json::to_string(&telem_event).expect("serialize telemetry");
    fabric
        .publish_telemetry("robot-1", &telem_json)
        .expect("publish telemetry");

    let telem_msg = tokio::time::timeout(Duration::from_millis(500), ws_stream.next())
        .await
        .expect("timed out waiting for telemetry frame")
        .expect("ws next")
        .expect("msg ok");

    match telem_msg {
        Message::Text(txt) => {
            let received_telem: RobotTelemetryEvent =
                serde_json::from_str(&txt).expect("parse telemetry event");
            assert_eq!(received_telem.robot_state, RobotState::Idle);
            assert_eq!(received_telem.command_id, Some("cmd-1234".to_string()));
        }
        other => panic!("expected text message with telemetry, got {other:?}"),
    }

    // 4. Drop WS client connection and verify ActiveSession is immediately released
    drop(ws_stream);
    tokio::time::sleep(Duration::from_millis(50)).await;
    assert!(!registry.is_active("robot-1"));

    // 5. Subsequent connection to robot-1 succeeds
    let (ws_stream2, _) = connect_async(&ws_url)
        .await
        .expect("Second WebSocket connection should succeed after release");
    assert!(registry.is_active("robot-1"));
    drop(ws_stream2);
}

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
        };
        let telem_json = serde_json::to_string(&telem_event).expect("serialize telemetry");
        fabric
            .publish_telemetry("robot-30hz", &telem_json)
            .expect("publish telemetry");
    }

    // Receive and assert all 60 frames without drop
    for i in 0..TOTAL_FRAMES {
        let msg = tokio::time::timeout(Duration::from_millis(500), ws_stream.next())
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
    tokio::time::sleep(Duration::from_millis(50)).await;
    assert_eq!(fabric.active_telemetry_subscriptions("robot-30hz"), 0);
}

#[tokio::test]
async fn test_ws_session_teardown_cleans_streaming_worker() {
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

    let ws_url = format!("ws://127.0.0.1:{port}/ws/teleop/robot/robot-lifecycle");
    let (ws_stream, _) = connect_async(&ws_url)
        .await
        .expect("WebSocket connection handshake failed");

    assert!(registry.is_active("robot-lifecycle"));
    assert_eq!(fabric.active_telemetry_subscriptions("robot-lifecycle"), 1);

    // Disconnect client
    drop(ws_stream);
    tokio::time::sleep(Duration::from_millis(50)).await;

    // Verify clean teardown: registry released and streaming worker cleaned up
    assert!(!registry.is_active("robot-lifecycle"));
    assert_eq!(fabric.active_telemetry_subscriptions("robot-lifecycle"), 0);
}

