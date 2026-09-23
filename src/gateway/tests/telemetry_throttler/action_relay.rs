#![allow(
    clippy::as_conversions,
    clippy::cast_precision_loss,
    clippy::suboptimal_flops,
    clippy::items_after_statements
)]

use actix_web::{web, App, HttpServer};
use futures_util::{SinkExt, StreamExt};
use gateway::action::ActionFeedbackFrame;
use gateway::domain::{CommandType, RobotCommand};
use gateway::{teleop_ws, ActiveSessionRegistry, DataFabricPort};
use std::time::Duration;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

#[tokio::test]
async fn test_ws_pick_and_place_translates_to_action_and_relays_feedback() {
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

    let ws_url = format!("ws://127.0.0.1:{port}/ws/teleop/robot/robot-action-test");
    let (mut ws_stream, _) = connect_async(&ws_url)
        .await
        .expect("WebSocket connection handshake failed");

    assert!(registry.is_active("robot-action-test"));

    // Subscribe to action goal on fabric
    let mut goal_rx = fabric
        .subscribe_action_goal("robot-action-test")
        .expect("subscribe action goal");

    // 1. Send valid PICK_AND_PLACE_TARGET frame over WebSocket
    let pnp_cmd = RobotCommand {
        command_id: "cmd-pnp-action-42".to_string(),
        sender_id: "test-teleop-client".to_string(),
        timestamp_ns: 1_700_000_000_000_000_000,
        r#type: CommandType::PickAndPlaceTarget,
        payload: serde_json::json!({
            "pick_x": 0.35,
            "pick_y": 0.15,
            "pick_z": 0.02,
            "drop_x": 0.40,
            "drop_y": -0.30,
            "drop_z": 0.08
        }),
    };
    ws_stream
        .send(Message::Text(
            serde_json::to_string(&pnp_cmd).expect("serialize pnp_cmd"),
        ))
        .await
        .expect("send PICK_AND_PLACE_TARGET");

    // 2. Assert translated PickAndPlaceGoal received on fabric
    let received_goal = tokio::time::timeout(Duration::from_millis(500), goal_rx.recv())
        .await
        .expect("timed out waiting for action goal")
        .expect("goal rx");

    assert_eq!(received_goal.command_id, "cmd-pnp-action-42");
    assert!(received_goal.use_custom_drop);
    assert!((received_goal.pick_coords.x - 0.35).abs() < 1e-6);
    assert!((received_goal.pick_coords.y - 0.15).abs() < 1e-6);
    assert!((received_goal.pick_coords.z - 0.02).abs() < 1e-6);
    assert!((received_goal.drop_coords.x - 0.40).abs() < 1e-6);
    assert!((received_goal.drop_coords.y - (-0.30)).abs() < 1e-6);
    assert!((received_goal.drop_coords.z - 0.08).abs() < 1e-6);

    // 3. Emit ActionFeedbackFrame onto fabric, verify client receives it over WebSocket
    let feedback_frame =
        ActionFeedbackFrame::new("cmd-pnp-action-42", "TRANSFERRING", 60.0, 1_700_000_000_100);
    fabric
        .publish_action_feedback("robot-action-test", &feedback_frame)
        .await
        .expect("publish action feedback");

    let client_msg = tokio::time::timeout(Duration::from_millis(500), ws_stream.next())
        .await
        .expect("timed out waiting for feedback frame")
        .expect("ws stream open")
        .expect("msg ok");

    match client_msg {
        Message::Text(txt) => {
            let received_fb: ActionFeedbackFrame =
                serde_json::from_str(&txt).expect("parse action feedback frame");
            assert_eq!(received_fb.r#type, "ACTION_FEEDBACK");
            assert_eq!(received_fb.command_id, "cmd-pnp-action-42");
            assert_eq!(received_fb.phase, "TRANSFERRING");
            assert!((received_fb.percent_complete - 60.0).abs() < 1e-6);
        }
        other => panic!("expected text message, got {other:?}"),
    }

    drop(ws_stream);
    tokio::time::sleep(Duration::from_millis(50)).await;
    assert!(!registry.is_active("robot-action-test"));
}
