use actix_web::{web, App, HttpServer};
use futures_util::{SinkExt, StreamExt};
use gateway::domain::{
    CommandType, ErrorFrame, PalmState, RobotCommand, RobotState, RobotTelemetryEvent,
};
use gateway::{teleop_ws, ActiveSessionRegistry, DataFabricPort};
use std::time::Duration;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

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
    let engage_cmd = tokio::time::timeout(Duration::from_millis(2000), cmd_rx.recv())
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
    let received_cmd = super::support::recv_client_command(&mut cmd_rx).await;
    assert_eq!(received_cmd.command_id, "cmd-1234");
    assert_eq!(received_cmd.r#type, CommandType::Ping);

    // 2. Send malformed command frame
    ws_stream
        .send(Message::Text("invalid JSON payload".to_string()))
        .await
        .expect("send malformed frame");

    // Expect ERROR frame back on WS without connection closing
    let error_msg = tokio::time::timeout(Duration::from_millis(2000), ws_stream.next())
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

    let telem_msg = tokio::time::timeout(Duration::from_millis(2000), ws_stream.next())
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
    let standby_cmd = tokio::time::timeout(Duration::from_millis(2000), cmd_rx.recv())
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
