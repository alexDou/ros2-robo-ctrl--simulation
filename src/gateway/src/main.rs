use actix_web::{middleware::Logger, web, App, HttpServer};
use gateway::ws::ws_index;
use log::info;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init_from_env(env_logger::Env::default().default_filter_or("info"));
    let host = "0.0.0.0";
    let port = 8080;

    info!("Starting Gateway Server on http://{}:{}", host, port);

    HttpServer::new(|| {
        App::new()
            .wrap(Logger::default())
            .route("/ws", web::get().to(ws_index))
    })
    .bind((host, port))?
    .run()
    .await
}
