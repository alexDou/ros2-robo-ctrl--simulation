#![allow(
    clippy::as_conversions,
    clippy::cast_precision_loss,
    clippy::suboptimal_flops,
    clippy::items_after_statements
)]

use actix_web::{test, web, App, HttpServer};
use futures_util::{SinkExt, StreamExt};
use gateway::domain::{
    CommandType, ErrorFrame, PalmState, PickAndPlaceTargetPayload, RobotCommand, RobotState,
    RobotTelemetryEvent, SpawnObjectPayload, SpawnObjectType,
};
use gateway::{teleop_ws, ActiveSessionRegistry, DataFabricPort};
use std::time::Duration;
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
    assert_eq!(
        resp1.status(),
        actix_web::http::StatusCode::SWITCHING_PROTOCOLS
    );

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

    // Subscribe before connect: Gateway auto-publishes ENGAGE on acquire
    let mut cmd_rx = fabric
        .subscribe_command("robot-1")
        .expect("subscribe command");

    // Connect WS client
    let (mut ws_stream, _) = connect_async(&ws_url)
        .await
        .expect("WebSocket connection handshake failed");

    // Verify session is active
    assert!(registry.is_active("robot-1"));

    // 0. Gateway auto-ENGAGE handshake forwarded to fabric on connect
    let engage_cmd = tokio::time::timeout(Duration::from_millis(500), cmd_rx.recv())
        .await
        .expect("timed out waiting for ENGAGE")
        .expect("cmd rx");
    assert_eq!(engage_cmd.r#type, CommandType::Engage);
    assert_eq!(engage_cmd.sender_id, "gateway");

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
    tokio::time::sleep(Duration::from_millis(200)).await;
    assert!(!registry.is_active("robot-1"));

    // 4b. Gateway auto-STANDBY handshake forwarded to fabric on disconnect
    let standby_cmd = tokio::time::timeout(Duration::from_millis(500), cmd_rx.recv())
        .await
        .expect("timed out waiting for STANDBY")
        .expect("cmd rx");
    assert_eq!(standby_cmd.r#type, CommandType::Standby);
    assert_eq!(standby_cmd.sender_id, "gateway");

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

#[allow(clippy::too_many_lines)]
#[tokio::test]
async fn test_ws_command_rate_limiting_and_emergency_bypass() {
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

    let ws_url = format!("ws://127.0.0.1:{port}/ws/teleop/robot/robot-ratelimit");
    let mut cmd_rx = fabric
        .subscribe_command("robot-ratelimit")
        .expect("subscribe command");

    let (mut ws_stream, _) = connect_async(&ws_url)
        .await
        .expect("WebSocket connection handshake failed");

    // Drain Gateway auto-ENGAGE handshake published on connect
    let engage = tokio::time::timeout(Duration::from_millis(500), cmd_rx.recv())
        .await
        .expect("timed out waiting for ENGAGE")
        .expect("cmd rx");
    assert_eq!(engage.r#type, CommandType::Engage);

    // 1. Send first command (Ping) -> Should succeed and reach fabric
    let cmd1 = RobotCommand {
        command_id: "cmd-rate-1".to_string(),
        sender_id: "test-client".to_string(),
        timestamp_ns: 1_700_000_000_000_000_000,
        r#type: CommandType::Ping,
        payload: serde_json::json!({}),
    };
    ws_stream
        .send(Message::Text(
            serde_json::to_string(&cmd1).expect("serialize cmd1"),
        ))
        .await
        .expect("send cmd1");

    let rx_cmd1 = tokio::time::timeout(Duration::from_millis(500), cmd_rx.recv())
        .await
        .expect("timed out waiting for cmd1")
        .expect("cmd rx");
    assert_eq!(rx_cmd1.command_id, "cmd-rate-1");

    // 2. Immediately send second non-emergency command -> Should be throttled
    let cmd2 = RobotCommand {
        command_id: "cmd-rate-2".to_string(),
        sender_id: "test-client".to_string(),
        timestamp_ns: 1_700_000_000_000_000_000,
        r#type: CommandType::Ping,
        payload: serde_json::json!({}),
    };
    ws_stream
        .send(Message::Text(
            serde_json::to_string(&cmd2).expect("serialize cmd2"),
        ))
        .await
        .expect("send cmd2");

    let error_msg = tokio::time::timeout(Duration::from_millis(500), ws_stream.next())
        .await
        .expect("timed out waiting for rate limit error frame")
        .expect("ws next")
        .expect("msg ok");

    match error_msg {
        Message::Text(txt) => {
            let err_frame: ErrorFrame = serde_json::from_str(&txt).expect("parse error frame");
            assert_eq!(err_frame.r#type, "ERROR");
            assert_eq!(err_frame.error_code, "RATE_LIMIT_EXCEEDED");
        }
        other => panic!("expected text message with RATE_LIMIT_EXCEEDED error, got {other:?}"),
    }

    // 3. Immediately send EMERGENCY_STOP -> Must bypass rate limiting unconditionally!
    let estop_cmd = RobotCommand {
        command_id: "cmd-estop-1".to_string(),
        sender_id: "test-client".to_string(),
        timestamp_ns: 1_700_000_000_000_000_000,
        r#type: CommandType::EmergencyStop,
        payload: serde_json::json!({"reason": "Safety trigger"}),
    };
    ws_stream
        .send(Message::Text(
            serde_json::to_string(&estop_cmd).expect("serialize estop"),
        ))
        .await
        .expect("send estop");

    let rx_estop = tokio::time::timeout(Duration::from_millis(500), cmd_rx.recv())
        .await
        .expect("timed out waiting for estop cmd")
        .expect("cmd rx");
    assert_eq!(rx_estop.command_id, "cmd-estop-1");
    assert_eq!(rx_estop.r#type, CommandType::EmergencyStop);

    // 4. Send malformed payload for PalmActuate -> Should return SCHEMA_VALIDATION_ERROR
    tokio::time::sleep(Duration::from_millis(60)).await;
    let malformed_palm_cmd = RobotCommand {
        command_id: "cmd-bad-palm".to_string(),
        sender_id: "test-client".to_string(),
        timestamp_ns: 1_700_000_000_000_000_000,
        r#type: CommandType::PalmActuate,
        payload: serde_json::json!({"action": "INVALID_ACTION"}),
    };
    ws_stream
        .send(Message::Text(
            serde_json::to_string(&malformed_palm_cmd).expect("serialize bad cmd"),
        ))
        .await
        .expect("send malformed palm cmd");

    let bad_payload_msg = tokio::time::timeout(Duration::from_millis(500), ws_stream.next())
        .await
        .expect("timed out waiting for schema validation error frame")
        .expect("ws next")
        .expect("msg ok");

    match bad_payload_msg {
        Message::Text(txt) => {
            let err_frame: ErrorFrame = serde_json::from_str(&txt).expect("parse error frame");
            assert_eq!(err_frame.r#type, "ERROR");
            assert_eq!(err_frame.error_code, "SCHEMA_VALIDATION_ERROR");
        }
        other => panic!("expected text message with SCHEMA_VALIDATION_ERROR, got {other:?}"),
    }

    drop(ws_stream);
}

#[allow(clippy::too_many_lines)]
#[tokio::test]
async fn test_ws_spawn_object_and_clear_workspace_handling_and_validation() {
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

    let ws_url = format!("ws://127.0.0.1:{port}/ws/teleop/robot/robot-workcell");
    let mut cmd_rx = fabric
        .subscribe_command("robot-workcell")
        .expect("subscribe command");

    let (mut ws_stream, _) = connect_async(&ws_url)
        .await
        .expect("WebSocket connection handshake failed");

    // Drain Gateway auto-ENGAGE handshake published on connect
    let engage = tokio::time::timeout(Duration::from_millis(500), cmd_rx.recv())
        .await
        .expect("timed out waiting for ENGAGE")
        .expect("cmd rx");
    assert_eq!(engage.r#type, CommandType::Engage);

    // 1. Send valid SPAWN_OBJECT command -> Forwarded to Zenoh fabric
    let spawn_cmd = RobotCommand {
        command_id: "cmd-spawn-valid".to_string(),
        sender_id: "test-client".to_string(),
        timestamp_ns: 1_700_000_000_000_000_000,
        r#type: CommandType::SpawnObject,
        payload: serde_json::json!({
            "x": 0.45,
            "y": -0.1,
            "z": 0.0,
            "object_type": "GEAR"
        }),
    };
    ws_stream
        .send(Message::Text(
            serde_json::to_string(&spawn_cmd).expect("serialize spawn"),
        ))
        .await
        .expect("send spawn");

    let rx_spawn = tokio::time::timeout(Duration::from_millis(500), cmd_rx.recv())
        .await
        .expect("timed out waiting for spawn cmd")
        .expect("cmd rx");
    assert_eq!(rx_spawn.command_id, "cmd-spawn-valid");
    assert_eq!(rx_spawn.r#type, CommandType::SpawnObject);
    let parsed_spawn: SpawnObjectPayload =
        serde_json::from_value(rx_spawn.payload).expect("parse payload");
    assert!((parsed_spawn.x - 0.45).abs() < 1e-6);
    assert!((parsed_spawn.y - (-0.1)).abs() < 1e-6);
    assert!((parsed_spawn.z - 0.0).abs() < 1e-6);
    assert_eq!(parsed_spawn.object_type, SpawnObjectType::Gear);

    // 2. Send malformed SPAWN_OBJECT command (missing required field `z`) -> Rejected with structured ErrorFrame
    tokio::time::sleep(Duration::from_millis(60)).await;
    let bad_spawn_cmd = RobotCommand {
        command_id: "cmd-spawn-bad-z".to_string(),
        sender_id: "test-client".to_string(),
        timestamp_ns: 1_700_000_000_000_000_000,
        r#type: CommandType::SpawnObject,
        payload: serde_json::json!({
            "x": 0.45,
            "y": -0.1,
            "object_type": "GEAR"
        }),
    };
    ws_stream
        .send(Message::Text(
            serde_json::to_string(&bad_spawn_cmd).expect("serialize bad spawn"),
        ))
        .await
        .expect("send bad spawn");

    let err_msg1 = tokio::time::timeout(Duration::from_millis(500), ws_stream.next())
        .await
        .expect("timed out waiting for error frame")
        .expect("ws next")
        .expect("msg ok");
    match err_msg1 {
        Message::Text(txt) => {
            let err_frame: ErrorFrame = serde_json::from_str(&txt).expect("parse error frame");
            assert_eq!(err_frame.r#type, "ERROR");
            assert_eq!(err_frame.error_code, "SCHEMA_VALIDATION_ERROR");
            assert!(err_frame.message.contains("SpawnObject"));
        }
        other => panic!("expected text error frame, got {other:?}"),
    }

    // 3. Send malformed SPAWN_OBJECT with unknown fields -> Rejected with structured ErrorFrame
    tokio::time::sleep(Duration::from_millis(60)).await;
    let extra_field_cmd = RobotCommand {
        command_id: "cmd-spawn-extra".to_string(),
        sender_id: "test-client".to_string(),
        timestamp_ns: 1_700_000_000_000_000_000,
        r#type: CommandType::SpawnObject,
        payload: serde_json::json!({
            "x": 0.45,
            "y": -0.1,
            "z": 0.0,
            "object_type": "GEAR",
            "extra_field": "disallowed"
        }),
    };
    ws_stream
        .send(Message::Text(
            serde_json::to_string(&extra_field_cmd).expect("serialize extra field spawn"),
        ))
        .await
        .expect("send extra field spawn");

    let err_msg2 = tokio::time::timeout(Duration::from_millis(500), ws_stream.next())
        .await
        .expect("timed out waiting for error frame")
        .expect("ws next")
        .expect("msg ok");
    match err_msg2 {
        Message::Text(txt) => {
            let err_frame: ErrorFrame = serde_json::from_str(&txt).expect("parse error frame");
            assert_eq!(err_frame.r#type, "ERROR");
            assert_eq!(err_frame.error_code, "SCHEMA_VALIDATION_ERROR");
        }
        other => panic!("expected text error frame, got {other:?}"),
    }

    // 3b. Send SPAWN_OBJECT with non-finite float coordinate (e.g. 1e309 overflow to Infinity) -> Rejected with SCHEMA_VALIDATION_ERROR
    tokio::time::sleep(Duration::from_millis(60)).await;
    let non_finite_json = r#"{
        "command_id": "cmd-spawn-nonfinite",
        "sender_id": "test-client",
        "timestamp_ns": 1700000000000000000,
        "type": "SPAWN_OBJECT",
        "payload": {
            "x": 1e309,
            "y": -0.1,
            "z": 0.0,
            "object_type": "GEAR"
        }
    }"#;
    ws_stream
        .send(Message::Text(non_finite_json.to_string()))
        .await
        .expect("send non-finite spawn");

    let err_msg_nonfinite = tokio::time::timeout(Duration::from_millis(500), ws_stream.next())
        .await
        .expect("timed out waiting for non-finite error frame")
        .expect("ws next")
        .expect("msg ok");
    match err_msg_nonfinite {
        Message::Text(txt) => {
            let err_frame: ErrorFrame = serde_json::from_str(&txt).expect("parse error frame");
            assert_eq!(err_frame.r#type, "ERROR");
            assert_eq!(err_frame.error_code, "SCHEMA_VALIDATION_ERROR");
            assert!(
                err_frame.message.contains("number out of range")
                    || err_frame.message.contains("finite floats")
                    || err_frame.message.contains("SpawnObject"),
                "Unexpected error message: {}",
                err_frame.message
            );
        }
        other => panic!("expected text error frame, got {other:?}"),
    }

    // 4. Send valid CLEAR_WORKSPACE command -> Forwarded to Zenoh fabric
    tokio::time::sleep(Duration::from_millis(60)).await;
    let clear_cmd = RobotCommand {
        command_id: "cmd-clear-valid".to_string(),
        sender_id: "test-client".to_string(),
        timestamp_ns: 1_700_000_000_000_000_000,
        r#type: CommandType::ClearWorkspace,
        payload: serde_json::json!({}),
    };
    ws_stream
        .send(Message::Text(
            serde_json::to_string(&clear_cmd).expect("serialize clear"),
        ))
        .await
        .expect("send clear");

    let rx_clear = tokio::time::timeout(Duration::from_millis(500), cmd_rx.recv())
        .await
        .expect("timed out waiting for clear cmd")
        .expect("cmd rx");
    assert_eq!(rx_clear.command_id, "cmd-clear-valid");
    assert_eq!(rx_clear.r#type, CommandType::ClearWorkspace);

    // 5. Send malformed CLEAR_WORKSPACE with unexpected fields -> Rejected with structured ErrorFrame
    tokio::time::sleep(Duration::from_millis(60)).await;
    let bad_clear_cmd = RobotCommand {
        command_id: "cmd-clear-bad".to_string(),
        sender_id: "test-client".to_string(),
        timestamp_ns: 1_700_000_000_000_000_000,
        r#type: CommandType::ClearWorkspace,
        payload: serde_json::json!({"unexpected_flag": true}),
    };
    ws_stream
        .send(Message::Text(
            serde_json::to_string(&bad_clear_cmd).expect("serialize bad clear"),
        ))
        .await
        .expect("send bad clear");

    let err_msg3 = tokio::time::timeout(Duration::from_millis(500), ws_stream.next())
        .await
        .expect("timed out waiting for error frame")
        .expect("ws next")
        .expect("msg ok");
    match err_msg3 {
        Message::Text(txt) => {
            let err_frame: ErrorFrame = serde_json::from_str(&txt).expect("parse error frame");
            assert_eq!(err_frame.r#type, "ERROR");
            assert_eq!(err_frame.error_code, "SCHEMA_VALIDATION_ERROR");
            assert!(err_frame.message.contains("ClearWorkspace"));
        }
        other => panic!("expected text error frame, got {other:?}"),
    }

    // 6. Verify connection is still open and subsequent valid commands succeed
    tokio::time::sleep(Duration::from_millis(60)).await;
    let ping_cmd = RobotCommand {
        command_id: "cmd-ping-after-errors".to_string(),
        sender_id: "test-client".to_string(),
        timestamp_ns: 1_700_000_000_000_000_000,
        r#type: CommandType::Ping,
        payload: serde_json::json!({}),
    };
    ws_stream
        .send(Message::Text(
            serde_json::to_string(&ping_cmd).expect("serialize ping"),
        ))
        .await
        .expect("send ping");

    let rx_ping = tokio::time::timeout(Duration::from_millis(500), cmd_rx.recv())
        .await
        .expect("timed out waiting for ping cmd")
        .expect("cmd rx");
    assert_eq!(rx_ping.command_id, "cmd-ping-after-errors");
    assert_eq!(rx_ping.r#type, CommandType::Ping);

    drop(ws_stream);
}

#[allow(clippy::too_many_lines)]
#[tokio::test]
async fn test_ws_pick_and_place_target_handling_and_validation() {
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

    let ws_url = format!("ws://127.0.0.1:{port}/ws/teleop/robot/robot-pnp");
    let mut cmd_rx = fabric
        .subscribe_command("robot-pnp")
        .expect("subscribe command");

    let (mut ws_stream, _) = connect_async(&ws_url)
        .await
        .expect("WebSocket connection handshake failed");

    // Drain Gateway auto-ENGAGE handshake published on connect
    let engage = tokio::time::timeout(Duration::from_millis(500), cmd_rx.recv())
        .await
        .expect("timed out waiting for ENGAGE")
        .expect("cmd rx");
    assert_eq!(engage.r#type, CommandType::Engage);

    // Verify session is active + 409 Conflict on concurrent attempt
    assert!(registry.is_active("robot-pnp"));
    match connect_async(&ws_url).await {
        Err(tokio_tungstenite::tungstenite::Error::Http(resp)) => {
            assert_eq!(resp.status().as_u16(), 409);
        }
        other => panic!("expected 409 Conflict, got {other:?}"),
    }

    // 1. Send valid PICK_AND_PLACE_TARGET (pick only) -> Forwarded to Zenoh fabric
    let pick_only_cmd = RobotCommand {
        command_id: "cmd-pnp-pick-only".to_string(),
        sender_id: "test-client".to_string(),
        timestamp_ns: 1_700_000_000_000_000_000,
        r#type: CommandType::PickAndPlaceTarget,
        payload: serde_json::json!({
            "pick_x": 0.45,
            "pick_y": 0.10,
            "pick_z": 0.0
        }),
    };
    ws_stream
        .send(Message::Text(
            serde_json::to_string(&pick_only_cmd).expect("serialize pick-only"),
        ))
        .await
        .expect("send pick-only");

    let rx_pick_only = tokio::time::timeout(Duration::from_millis(500), cmd_rx.recv())
        .await
        .expect("timed out waiting for pick-only cmd")
        .expect("cmd rx");
    assert_eq!(rx_pick_only.command_id, "cmd-pnp-pick-only");
    assert_eq!(rx_pick_only.r#type, CommandType::PickAndPlaceTarget);
    let parsed_pick_only: PickAndPlaceTargetPayload =
        serde_json::from_value(rx_pick_only.payload).expect("parse payload");
    assert!((parsed_pick_only.pick_x - 0.45).abs() < 1e-6);
    assert!((parsed_pick_only.pick_y - 0.10).abs() < 1e-6);
    assert!((parsed_pick_only.pick_z - 0.0).abs() < 1e-6);
    assert_eq!(parsed_pick_only.drop_x, None);
    assert_eq!(parsed_pick_only.drop_y, None);
    assert_eq!(parsed_pick_only.drop_z, None);

    // 2. Enforce 20 Hz rate limiting: immediate subsequent command is rejected with RATE_LIMIT_EXCEEDED
    let rate_limit_cmd = RobotCommand {
        command_id: "cmd-pnp-fast".to_string(),
        sender_id: "test-client".to_string(),
        timestamp_ns: 1_700_000_000_000_000_000,
        r#type: CommandType::PickAndPlaceTarget,
        payload: serde_json::json!({
            "pick_x": 0.45,
            "pick_y": 0.10,
            "pick_z": 0.0
        }),
    };
    ws_stream
        .send(Message::Text(
            serde_json::to_string(&rate_limit_cmd).expect("serialize rate-limit cmd"),
        ))
        .await
        .expect("send rate-limit cmd");

    let err_msg_rate = tokio::time::timeout(Duration::from_millis(500), ws_stream.next())
        .await
        .expect("timed out waiting for rate limit error")
        .expect("ws next")
        .expect("msg ok");
    match err_msg_rate {
        Message::Text(txt) => {
            let err_frame: ErrorFrame = serde_json::from_str(&txt).expect("parse error frame");
            assert_eq!(err_frame.r#type, "ERROR");
            assert_eq!(err_frame.error_code, "RATE_LIMIT_EXCEEDED");
        }
        other => panic!("expected text error frame, got {other:?}"),
    }
    assert!(
        cmd_rx.try_recv().is_err(),
        "Rate-limited command must not be forwarded to fabric"
    );

    // 3. Send valid PICK_AND_PLACE_TARGET with drop coordinates (after 60ms delay to respect 20 Hz throttle)
    tokio::time::sleep(Duration::from_millis(60)).await;
    let pnp_with_drop = RobotCommand {
        command_id: "cmd-pnp-with-drop".to_string(),
        sender_id: "test-client".to_string(),
        timestamp_ns: 1_700_000_000_000_000_000,
        r#type: CommandType::PickAndPlaceTarget,
        payload: serde_json::json!({
            "pick_x": 0.45,
            "pick_y": 0.10,
            "pick_z": 0.0,
            "drop_x": 0.40,
            "drop_y": -0.30,
            "drop_z": 0.04
        }),
    };
    ws_stream
        .send(Message::Text(
            serde_json::to_string(&pnp_with_drop).expect("serialize pnp with drop"),
        ))
        .await
        .expect("send pnp with drop");

    let rx_with_drop = tokio::time::timeout(Duration::from_millis(500), cmd_rx.recv())
        .await
        .expect("timed out waiting for pnp cmd with drop")
        .expect("cmd rx");
    assert_eq!(rx_with_drop.command_id, "cmd-pnp-with-drop");
    assert_eq!(rx_with_drop.r#type, CommandType::PickAndPlaceTarget);
    let parsed_with_drop: PickAndPlaceTargetPayload =
        serde_json::from_value(rx_with_drop.payload).expect("parse payload");
    assert!((parsed_with_drop.pick_x - 0.45).abs() < 1e-6);
    assert!((parsed_with_drop.pick_y - 0.10).abs() < 1e-6);
    assert!((parsed_with_drop.pick_z - 0.0).abs() < 1e-6);
    assert_eq!(parsed_with_drop.drop_x, Some(0.40));
    assert_eq!(parsed_with_drop.drop_y, Some(-0.30));
    assert_eq!(parsed_with_drop.drop_z, Some(0.04));

    // 4. Send malformed PICK_AND_PLACE_TARGET (missing required field `pick_z`) -> Structured ErrorFrame
    tokio::time::sleep(Duration::from_millis(60)).await;
    let bad_pnp_missing = RobotCommand {
        command_id: "cmd-pnp-missing-z".to_string(),
        sender_id: "test-client".to_string(),
        timestamp_ns: 1_700_000_000_000_000_000,
        r#type: CommandType::PickAndPlaceTarget,
        payload: serde_json::json!({
            "pick_x": 0.45,
            "pick_y": 0.10
        }),
    };
    ws_stream
        .send(Message::Text(
            serde_json::to_string(&bad_pnp_missing).expect("serialize bad pnp missing"),
        ))
        .await
        .expect("send bad pnp missing");

    let err_msg_missing = tokio::time::timeout(Duration::from_millis(500), ws_stream.next())
        .await
        .expect("timed out waiting for missing field error")
        .expect("ws next")
        .expect("msg ok");
    match err_msg_missing {
        Message::Text(txt) => {
            let err_frame: ErrorFrame = serde_json::from_str(&txt).expect("parse error frame");
            assert_eq!(err_frame.r#type, "ERROR");
            assert_eq!(err_frame.error_code, "SCHEMA_VALIDATION_ERROR");
            assert!(err_frame.message.contains("PickAndPlaceTarget"));
        }
        other => panic!("expected text error frame, got {other:?}"),
    }
    assert!(
        cmd_rx.try_recv().is_err(),
        "Malformed command (missing field) must not be forwarded to fabric"
    );

    // 5. Send malformed PICK_AND_PLACE_TARGET with unknown extra fields -> Structured ErrorFrame
    tokio::time::sleep(Duration::from_millis(60)).await;
    let bad_pnp_extra = RobotCommand {
        command_id: "cmd-pnp-extra".to_string(),
        sender_id: "test-client".to_string(),
        timestamp_ns: 1_700_000_000_000_000_000,
        r#type: CommandType::PickAndPlaceTarget,
        payload: serde_json::json!({
            "pick_x": 0.45,
            "pick_y": 0.10,
            "pick_z": 0.0,
            "unexpected_property": true
        }),
    };
    ws_stream
        .send(Message::Text(
            serde_json::to_string(&bad_pnp_extra).expect("serialize bad pnp extra"),
        ))
        .await
        .expect("send bad pnp extra");

    let err_msg_extra = tokio::time::timeout(Duration::from_millis(500), ws_stream.next())
        .await
        .expect("timed out waiting for extra field error")
        .expect("ws next")
        .expect("msg ok");
    match err_msg_extra {
        Message::Text(txt) => {
            let err_frame: ErrorFrame = serde_json::from_str(&txt).expect("parse error frame");
            assert_eq!(err_frame.r#type, "ERROR");
            assert_eq!(err_frame.error_code, "SCHEMA_VALIDATION_ERROR");
            assert!(err_frame.message.contains("PickAndPlaceTarget"));
        }
        other => panic!("expected text error frame, got {other:?}"),
    }
    assert!(
        cmd_rx.try_recv().is_err(),
        "Malformed command (extra field) must not be forwarded to fabric"
    );

    // 6. Send malformed PICK_AND_PLACE_TARGET with non-finite float coordinates -> Structured ErrorFrame
    tokio::time::sleep(Duration::from_millis(60)).await;
    let non_finite_json = r#"{
        "command_id": "cmd-pnp-nonfinite",
        "sender_id": "test-client",
        "timestamp_ns": 1700000000000000000,
        "type": "PICK_AND_PLACE_TARGET",
        "payload": {
            "pick_x": 1e309,
            "pick_y": 0.10,
            "pick_z": 0.0
        }
    }"#;
    ws_stream
        .send(Message::Text(non_finite_json.to_string()))
        .await
        .expect("send non-finite pnp");

    let err_msg_nonfinite = tokio::time::timeout(Duration::from_millis(500), ws_stream.next())
        .await
        .expect("timed out waiting for non-finite error")
        .expect("ws next")
        .expect("msg ok");
    match err_msg_nonfinite {
        Message::Text(txt) => {
            let err_frame: ErrorFrame = serde_json::from_str(&txt).expect("parse error frame");
            assert_eq!(err_frame.r#type, "ERROR");
            assert_eq!(err_frame.error_code, "SCHEMA_VALIDATION_ERROR");
            assert!(
                err_frame.message.contains("number out of range")
                    || err_frame.message.contains("finite floats")
                    || err_frame.message.contains("PickAndPlaceTarget"),
                "Unexpected error message: {}",
                err_frame.message
            );
        }
        other => panic!("expected text error frame, got {other:?}"),
    }
    assert!(
        cmd_rx.try_recv().is_err(),
        "Malformed command (non-finite) must not be forwarded to fabric"
    );

    // 7. Verify session durability: subsequent valid PING command succeeds after errors
    tokio::time::sleep(Duration::from_millis(60)).await;
    let ping_cmd = RobotCommand {
        command_id: "cmd-ping-after-pnp-errors".to_string(),
        sender_id: "test-client".to_string(),
        timestamp_ns: 1_700_000_000_000_000_000,
        r#type: CommandType::Ping,
        payload: serde_json::json!({}),
    };
    ws_stream
        .send(Message::Text(
            serde_json::to_string(&ping_cmd).expect("serialize ping"),
        ))
        .await
        .expect("send ping");

    let rx_ping = tokio::time::timeout(Duration::from_millis(500), cmd_rx.recv())
        .await
        .expect("timed out waiting for ping cmd")
        .expect("cmd rx");
    assert_eq!(rx_ping.command_id, "cmd-ping-after-pnp-errors");
    assert_eq!(rx_ping.r#type, CommandType::Ping);

    // 8. Clean session drop and verify session registry is cleaned up
    drop(ws_stream);
    tokio::time::sleep(Duration::from_millis(50)).await;
    assert!(!registry.is_active("robot-pnp"));
}

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
    let first = tokio::time::timeout(Duration::from_millis(500), cmd_rx.recv())
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
