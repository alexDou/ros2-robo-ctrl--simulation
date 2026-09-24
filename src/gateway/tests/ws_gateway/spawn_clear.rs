use actix_web::{web, App, HttpServer};
use futures_util::{SinkExt, StreamExt};
use gateway::domain::{CommandType, ErrorFrame, RobotCommand, SpawnObjectPayload, SpawnObjectType};
use gateway::{teleop_ws, ActiveSessionRegistry, DataFabricPort};
use std::time::Duration;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

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
    let engage = tokio::time::timeout(Duration::from_millis(2000), cmd_rx.recv())
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

    let rx_spawn = super::support::recv_client_command(&mut cmd_rx).await;
    assert_eq!(rx_spawn.command_id, "cmd-spawn-valid");
    assert_eq!(rx_spawn.r#type, CommandType::SpawnObject);
    // Unit 7.2: gateway enriches after blind validation; fabric side carries
    // color + defective (blind-shape assertions cover inbound only).
    let color = rx_spawn.payload["color"]
        .as_str()
        .expect("enriched color");
    assert!(
        matches!(color, "WHITE" | "GREEN" | "BLUE"),
        "unexpected enriched color {color}"
    );
    assert!(
        rx_spawn.payload["defective"].is_boolean(),
        "enriched defective flag must be boolean"
    );
    let mut blind = rx_spawn.payload.clone();
    let obj = blind.as_object_mut().expect("payload object");
    obj.remove("color");
    obj.remove("defective");
    let parsed_spawn: SpawnObjectPayload =
        serde_json::from_value(blind).expect("parse blind payload");
    assert!((parsed_spawn.x - 0.45).abs() < 1e-6);
    assert!((parsed_spawn.y - (-0.1)).abs() < 1e-6);
    assert!((parsed_spawn.z - 0.0).abs() < 1e-6);
    assert_eq!(parsed_spawn.object_type, SpawnObjectType::Gear);

    // 2. Send malformed SPAWN_OBJECT command (missing required field `z`) -> Rejected with structured ErrorFrame
    tokio::time::sleep(Duration::from_millis(120)).await;
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

    let err_msg1 = tokio::time::timeout(Duration::from_millis(2000), ws_stream.next())
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
    tokio::time::sleep(Duration::from_millis(120)).await;
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

    let err_msg2 = tokio::time::timeout(Duration::from_millis(2000), ws_stream.next())
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
    tokio::time::sleep(Duration::from_millis(120)).await;
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

    let err_msg_nonfinite = tokio::time::timeout(Duration::from_millis(2000), ws_stream.next())
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
    tokio::time::sleep(Duration::from_millis(120)).await;
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

    let rx_clear = super::support::recv_client_command(&mut cmd_rx).await;
    assert_eq!(rx_clear.command_id, "cmd-clear-valid");
    assert_eq!(rx_clear.r#type, CommandType::ClearWorkspace);

    // 5. Send malformed CLEAR_WORKSPACE with unexpected fields -> Rejected with structured ErrorFrame
    tokio::time::sleep(Duration::from_millis(120)).await;
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

    let err_msg3 = tokio::time::timeout(Duration::from_millis(2000), ws_stream.next())
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
    tokio::time::sleep(Duration::from_millis(120)).await;
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

    let rx_ping = super::support::recv_client_command(&mut cmd_rx).await;
    assert_eq!(rx_ping.command_id, "cmd-ping-after-errors");
    assert_eq!(rx_ping.r#type, CommandType::Ping);

    drop(ws_stream);
}
