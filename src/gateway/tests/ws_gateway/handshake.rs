use actix_web::{test, web, App};
use gateway::{teleop_ws, ActiveSessionRegistry, DataFabricPort};

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
