use actix_web::{web, App, HttpServer};
use futures_util::{SinkExt, StreamExt};
use gateway::domain::{CommandType, ErrorFrame, RobotCommand};
use gateway::{teleop_ws, ActiveSessionRegistry, DataFabricPort};
use std::time::Duration;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

#[tokio::test]
async fn test_ws_teleop_joint_target_rejected_without_handler() {
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

    let ws_url = format!("ws://127.0.0.1:{port}/ws/teleop/robot/robot-teleop-reject");
    let mut cmd_rx = fabric
        .subscribe_command("robot-teleop-reject")
        .expect("subscribe command");

    let (mut ws_stream, _) = connect_async(&ws_url)
        .await
        .expect("WebSocket connection handshake failed");

    let engage = tokio::time::timeout(Duration::from_millis(2000), cmd_rx.recv())
        .await
        .expect("timed out waiting for ENGAGE")
        .expect("cmd rx");
    assert_eq!(engage.r#type, CommandType::Engage);

    // TELEOP_JOINT_TARGET has no edge handler: must be rejected, never forwarded.
    tokio::time::sleep(Duration::from_millis(120)).await;
    let teleop_cmd = RobotCommand {
        command_id: "cmd-teleop-1".to_string(),
        sender_id: "test-client".to_string(),
        timestamp_ns: 1_700_000_000_000_000_000,
        r#type: CommandType::TeleopJointTarget,
        payload: serde_json::json!({"joint_positions": [0.0, 0.0, 0.0, 0.0, 0.0, 0.0]}),
    };
    ws_stream
        .send(Message::Text(
            serde_json::to_string(&teleop_cmd).expect("serialize teleop"),
        ))
        .await
        .expect("send teleop");

    let err_msg = tokio::time::timeout(Duration::from_millis(2000), ws_stream.next())
        .await
        .expect("timed out waiting for rejection")
        .expect("ws next")
        .expect("msg ok");
    match err_msg {
        Message::Text(txt) => {
            let err_frame: ErrorFrame = serde_json::from_str(&txt).expect("parse error frame");
            assert_eq!(err_frame.r#type, "ERROR");
            assert_eq!(err_frame.error_code, "SCHEMA_VALIDATION_ERROR");
            assert!(
                err_frame.message.contains("TeleopJointTarget"),
                "Unexpected error message: {}",
                err_frame.message
            );
        }
        other => panic!("expected text error frame, got {other:?}"),
    }
    super::support::assert_no_client_command(&mut cmd_rx, "teleop command must not reach fabric").await;

    // Session durable: subsequent PING still forwarded.
    tokio::time::sleep(Duration::from_millis(120)).await;
    let ping_cmd = RobotCommand {
        command_id: "cmd-ping-after-teleop".to_string(),
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
    let rx_ping = super::support::recv_client_command(&mut cmd_rx).await;
    assert_eq!(rx_ping.command_id, "cmd-ping-after-teleop");

    drop(ws_stream);
}
