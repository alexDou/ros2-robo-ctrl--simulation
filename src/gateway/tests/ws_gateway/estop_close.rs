use actix_web::{web, App, HttpServer};
use futures_util::{SinkExt, StreamExt};
use gateway::domain::{CommandType, RobotCommand};
use gateway::{teleop_ws, ActiveSessionRegistry, DataFabricPort};
use std::time::Duration;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

/// D31: EMERGENCY_STOP is forwarded, then the Gateway ends the session and frees the robot slot,
/// so recovery is always a fresh connect (whose CLEAR_WORKSPACE runs the flush reset).
#[tokio::test]
async fn test_ws_emergency_stop_is_forwarded_then_the_session_closes() {
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
    tokio::spawn(server.run());

    let ws_url = format!("ws://127.0.0.1:{port}/ws/teleop/robot/robot-estop");
    let mut cmd_rx = fabric
        .subscribe_command("robot-estop")
        .expect("subscribe command");
    let (mut ws_stream, _) = connect_async(&ws_url)
        .await
        .expect("WebSocket handshake failed");
    let estop = RobotCommand {
        command_id: "cmd-estop-close".to_string(),
        sender_id: "test-client".to_string(),
        timestamp_ns: 1_700_000_000_000_000_000,
        r#type: CommandType::EmergencyStop,
        payload: serde_json::json!({"reason": "Operator toolbar emergency stop triggered"}),
    };

    ws_stream
        .send(Message::Text(
            serde_json::to_string(&estop).expect("serialize estop"),
        ))
        .await
        .expect("send estop");

    let forwarded = super::support::recv_client_command(&mut cmd_rx).await;
    assert_eq!(forwarded.r#type, CommandType::EmergencyStop);
    let close = loop {
        match tokio::time::timeout(Duration::from_millis(2000), ws_stream.next())
            .await
            .expect("timed out waiting for the close frame")
        {
            Some(Ok(Message::Close(frame))) => break frame,
            Some(Ok(_)) => {}
            other => panic!("expected a close frame, got {other:?}"),
        }
    };
    assert_eq!(close.expect("close reason").reason, "EMERGENCY_STOP");
    tokio::time::sleep(Duration::from_millis(100)).await;
    assert!(!registry.is_active("robot-estop"));
    let standby = super::support::recv_gateway_command(&mut cmd_rx, CommandType::Standby).await;
    assert_eq!(standby.r#type, CommandType::Standby); // the arm parks without moving (it is FAULT)
}
