pub mod ws {
    use actix_web::{web, Error, HttpRequest, HttpResponse};
    use actix_ws::Message;
    use futures_util::StreamExt;
    use log::info;

    pub async fn ws_index(req: HttpRequest, stream: web::Payload) -> Result<HttpResponse, Error> {
        let (res, mut session, mut msg_stream) = actix_ws::handle(&req, stream)?;

        actix_web::rt::spawn(async move {
            while let Some(Ok(msg)) = msg_stream.next().await {
                match msg {
                    Message::Text(text) => {
                        info!("Received WS message: {}", text);
                        if session.text(text).await.is_err() {
                            break;
                        }
                    }
                    Message::Ping(bytes) => {
                        if session.pong(&bytes).await.is_err() {
                            break;
                        }
                    }
                    Message::Close(reason) => {
                        let _ = session.close(reason).await;
                        break;
                    }
                    _ => {}
                }
            }
        });

        Ok(res)
    }
}

#[cfg(test)]
mod tests {
    use super::ws::ws_index;
    use actix_web::{test, web, App};

    #[actix_web::test]
    async fn test_ws_handshake_success() {
        let app = test::init_service(
            App::new().route("/ws", web::get().to(ws_index)),
        )
        .await;

        let req = test::TestRequest::get()
            .uri("/ws")
            .insert_header(("connection", "upgrade"))
            .insert_header(("upgrade", "websocket"))
            .insert_header(("sec-websocket-version", "13"))
            .insert_header(("sec-websocket-key", "dGhlIHNhbXBsZSBub25jZQ=="))
            .to_request();

        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), actix_web::http::StatusCode::SWITCHING_PROTOCOLS);
    }

    #[actix_web::test]
    async fn test_ws_handshake_missing_headers_fails() {
        let app = test::init_service(
            App::new().route("/ws", web::get().to(ws_index)),
        )
        .await;

        let req = test::TestRequest::get().uri("/ws").to_request();
        let resp = test::call_service(&app, req).await;
        assert_ne!(resp.status(), actix_web::http::StatusCode::SWITCHING_PROTOCOLS);
    }
}
