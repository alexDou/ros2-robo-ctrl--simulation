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
    let throttler = gateway::throttler::TelemetryThrottler::new();

    if let Some(session) = fabric.zenoh_session() {
        let fabric_clone = fabric.clone();
        let mut throttled_rx = throttler.subscribe_json();
        tokio::spawn(async move {
            while let Ok(telem_json) = throttled_rx.recv().await {
                let _ = fabric_clone
                    .publish_telemetry_async(gateway::domain::DEFAULT_ROBOT_ID, &telem_json)
                    .await;
            }
        });
        let _ = throttler.attach_zenoh(&session, "**/joint_states").await;
        let _ = throttler.attach_zenoh(&session, "rt/joint_states").await;
        let _ = throttler.attach_zenoh(&session, "joint_states").await;
        info!("TelemetryThrottler attached to Zenoh joint_states mirrors");
    }

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
