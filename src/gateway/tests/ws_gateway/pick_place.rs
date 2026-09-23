use actix_web::{web, App, HttpServer};
use futures_util::{SinkExt, StreamExt};
use gateway::domain::{CommandType, ErrorFrame, PickAndPlaceTargetPayload, RobotCommand};
use gateway::{teleop_ws, ActiveSessionRegistry, DataFabricPort};
use std::time::Duration;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

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
    let engage = tokio::time::timeout(Duration::from_millis(2000), cmd_rx.recv())
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
    // 1+2. Send valid pick-only + immediate follow-up back-to-back; the follow-up
    // must be rejected with RATE_LIMIT_EXCEEDED (helper retries on stalls).
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
    let rx_pick_only =
        super::support::expect_rate_limited(&mut ws_stream, &mut cmd_rx, &pick_only_cmd, &rate_limit_cmd).await;
    assert_eq!(rx_pick_only.r#type, CommandType::PickAndPlaceTarget);
    let parsed_pick_only: PickAndPlaceTargetPayload =
        serde_json::from_value(rx_pick_only.payload).expect("parse payload");
    assert!((parsed_pick_only.pick_x - 0.45).abs() < 1e-6);
    assert!((parsed_pick_only.pick_y - 0.10).abs() < 1e-6);
    assert!((parsed_pick_only.pick_z - 0.0).abs() < 1e-6);
    assert_eq!(parsed_pick_only.drop_x, None);
    assert_eq!(parsed_pick_only.drop_y, None);
    assert_eq!(parsed_pick_only.drop_z, None);

    // 3. Send valid PICK_AND_PLACE_TARGET with drop coordinates (after 60ms delay to respect 20 Hz throttle)
    tokio::time::sleep(Duration::from_millis(120)).await;
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

    let rx_with_drop = super::support::recv_client_command(&mut cmd_rx).await;
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
    tokio::time::sleep(Duration::from_millis(120)).await;
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

    let err_msg_missing = tokio::time::timeout(Duration::from_millis(2000), ws_stream.next())
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
    super::support::assert_no_client_command(&mut cmd_rx, "malformed command").await;

    // 5. Send malformed PICK_AND_PLACE_TARGET with unknown extra fields -> Structured ErrorFrame
    tokio::time::sleep(Duration::from_millis(120)).await;
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

    let err_msg_extra = tokio::time::timeout(Duration::from_millis(2000), ws_stream.next())
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
    super::support::assert_no_client_command(&mut cmd_rx, "malformed command").await;

    // 6. Send malformed PICK_AND_PLACE_TARGET with non-finite float coordinates -> Structured ErrorFrame
    tokio::time::sleep(Duration::from_millis(120)).await;
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

    let err_msg_nonfinite = tokio::time::timeout(Duration::from_millis(2000), ws_stream.next())
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
    super::support::assert_no_client_command(&mut cmd_rx, "malformed command").await;

    // 7. Verify session durability: subsequent valid PING command succeeds after errors
    tokio::time::sleep(Duration::from_millis(120)).await;
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

    let rx_ping = super::support::recv_client_command(&mut cmd_rx).await;
    assert_eq!(rx_ping.command_id, "cmd-ping-after-pnp-errors");
    assert_eq!(rx_ping.r#type, CommandType::Ping);

    // 8. Clean session drop and verify session registry is cleaned up
    drop(ws_stream);
    tokio::time::sleep(Duration::from_millis(100)).await;
    assert!(!registry.is_active("robot-pnp"));
}
