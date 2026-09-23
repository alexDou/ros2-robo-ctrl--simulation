use actix_web::{web, App, HttpServer};
use gateway::{teleop_ws, ActiveSessionRegistry, DataFabricPort};
use std::time::Duration;
use tokio_tungstenite::connect_async;

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
    tokio::time::sleep(Duration::from_millis(100)).await;

    // Verify clean teardown: registry released and streaming worker cleaned up
    assert!(!registry.is_active("robot-lifecycle"));
    assert_eq!(fabric.active_telemetry_subscriptions("robot-lifecycle"), 0);
}
