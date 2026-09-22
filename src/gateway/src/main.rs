use actix_web::{middleware::Logger, web, App, HttpResponse, HttpServer, Responder};
use gateway::fabric::DataFabricPort;
use gateway::session::ActiveSessionRegistry;
use gateway::ws::teleop_ws;
use log::info;

async fn health_check() -> impl Responder {
    HttpResponse::Ok().json(serde_json::json!({ "status": "UP" }))
}

#[tokio::main]
async fn main() -> std::io::Result<()> {
    env_logger::init_from_env(env_logger::Env::default().default_filter_or("info"));
    let host = std::env::var("GATEWAY_HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
    let port: u16 = std::env::var("GATEWAY_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8080);

    info!("Initializing Gateway DataFabric adapter...");
    let fabric = match zenoh::open(zenoh::Config::default()).await {
        Ok(session) => {
            info!("Connected to Eclipse Zenoh DataFabric session.");
            DataFabricPort::zenoh(session)
        }
        Err(e) => {
            log::warn!("Failed to open Zenoh session ({e}); falling back to in-memory fabric");
            DataFabricPort::memory()
        }
    };

    let session_registry = ActiveSessionRegistry::default();
    // Single-owner rule (Unit 6.7): EdgeBridge is sole writer to
    // robot/{id}/telemetry. Gateway never synthesizes workcell snapshots
    // from raw /joint_states and never republishes to the same Zenoh key.
    // Throttler stays as WS-side decimator only (see ws.rs); no Zenoh publish
    // here, no attach_zenoh to joint_states mirrors. Previously this block
    // flooded the topic at 30 Hz with default-empty workcell, interleaving
    // with authoritative edge frames -> web single-frame delete -> blink/vanish.
    // ponytail: LIVE 500 Hz decimation belongs WS-side (fabric->throttler->WS),
    // never Zenoh->Zenoh. Re-add only behind that path.

    let registry_data = web::Data::new(session_registry);
    let fabric_data = web::Data::new(fabric);

    info!("Starting Gateway Server on http://{host}:{port}");

    HttpServer::new(move || {
        App::new()
            .wrap(Logger::default())
            .app_data(registry_data.clone())
            .app_data(fabric_data.clone())
            .route("/health", web::get().to(health_check))
            .route("/ws/teleop/robot/{id}", web::get().to(teleop_ws))
    })
    .bind((host.as_str(), port))?
    .run()
    .await
}
