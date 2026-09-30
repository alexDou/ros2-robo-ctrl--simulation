use actix_web::{web, App, HttpServer};
use futures_util::{SinkExt, StreamExt};
use gateway::domain::{CommandType, ErrorFrame, RobotCommand};
use gateway::{teleop_ws, ActiveSessionRegistry, DataFabricPort};
use std::time::Duration;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

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
    let engage = tokio::time::timeout(Duration::from_millis(2000), cmd_rx.recv())
        .await
        .expect("timed out waiting for ENGAGE")
        .expect("cmd rx");
    assert_eq!(engage.r#type, CommandType::Engage);

    let ping = |id: String| RobotCommand {
        command_id: id,
        sender_id: "test-client".to_string(),
        timestamp_ns: 1_700_000_000_000_000_000,
        r#type: CommandType::Ping,
        payload: serde_json::json!({}),
    };

    // 1. A burst of legitimate back-to-back commands (well under the burst
    //    allowance) must ALL be forwarded and never rejected.
    for i in 0..10 {
        ws_stream
            .send(Message::Text(
                serde_json::to_string(&ping(format!("cmd-burst-{i}"))).expect("serialize ping"),
            ))
            .await
            .expect("send burst ping");
    }
    for i in 0..10 {
        let got = super::support::recv_client_command(&mut cmd_rx).await;
        assert_eq!(got.command_id, format!("cmd-burst-{i}"));
    }
    assert!(
        tokio::time::timeout(Duration::from_millis(300), ws_stream.next())
            .await
            .is_err(),
        "a legitimate burst must not produce any error frame"
    );

    // 2. A sustained flood far beyond the ceiling is still rejected.
    tokio::time::sleep(Duration::from_millis(500)).await; // let the bucket refill
    let flood = 300;
    for i in 0..flood {
        ws_stream
            .send(Message::Text(
                serde_json::to_string(&ping(format!("cmd-flood-{i}"))).expect("serialize ping"),
            ))
            .await
            .expect("send flood ping");
    }
    let mut rejected = 0;
    while let Ok(Some(Ok(Message::Text(txt)))) =
        tokio::time::timeout(Duration::from_millis(500), ws_stream.next()).await
    {
        let err: ErrorFrame = serde_json::from_str(&txt).expect("parse error frame");
        assert_eq!(err.error_code, "RATE_LIMIT_EXCEEDED");
        rejected += 1;
    }
    let mut forwarded = 0;
    while let Ok(cmd) = cmd_rx.try_recv() {
        if cmd.sender_id != "gateway" {
            forwarded += 1;
        }
    }
    assert_eq!(
        forwarded + rejected,
        flood,
        "every flood command is either forwarded or rejected"
    );
    assert!(
        forwarded >= 20,
        "burst allowance must be honoured, forwarded {forwarded}"
    );
    assert!(
        rejected >= 100,
        "sustained flood must be rejected, rejected {rejected}"
    );

    // 3. EMERGENCY_STOP straight after the flood -> Must bypass rate limiting unconditionally!
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

    let rx_estop = tokio::time::timeout(Duration::from_millis(2000), cmd_rx.recv())
        .await
        .expect("timed out waiting for estop cmd")
        .expect("cmd rx");
    assert_eq!(rx_estop.command_id, "cmd-estop-1");
    assert_eq!(rx_estop.r#type, CommandType::EmergencyStop);

    // 4. Send malformed payload for PalmActuate -> Should return SCHEMA_VALIDATION_ERROR
    tokio::time::sleep(Duration::from_millis(120)).await;
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

    let bad_payload_msg = tokio::time::timeout(Duration::from_millis(2000), ws_stream.next())
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
