use actix_web::{web, HttpRequest, HttpResponse};
use actix_ws::Message;
use futures_util::StreamExt;
use log::{error, info, warn};

use crate::domain::ErrorFrame;
use crate::fabric::DataFabricPort;
use crate::session::{ActiveSessionGuard, ActiveSessionRegistry, SessionError};

fn current_time_ns() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| u64::try_from(d.as_nanos()).unwrap_or(u64::MAX))
}

fn validate_command_payload(cmd: &crate::domain::RobotCommand) -> Result<(), String> {
    use crate::domain::{
        ClearWorkspacePayload, CommandType, EmergencyStopPayload, PalmActuatePayload,
        ResetFaultPayload, SpawnObjectPayload, TrajectoryExecutePayload,
    };
    use serde::Deserialize;
    match cmd.r#type {
        CommandType::PalmActuate => {
            PalmActuatePayload::deserialize(&cmd.payload)
                .map(|_| ())
                .map_err(|e| e.to_string())
        }
        CommandType::TrajectoryExecute => {
            TrajectoryExecutePayload::deserialize(&cmd.payload)
                .map(|_| ())
                .map_err(|e| e.to_string())
        }
        CommandType::EmergencyStop => {
            EmergencyStopPayload::deserialize(&cmd.payload)
                .map(|_| ())
                .map_err(|e| e.to_string())
        }
        CommandType::ResetFault => {
            ResetFaultPayload::deserialize(&cmd.payload)
                .map(|_| ())
                .map_err(|e| e.to_string())
        }
        CommandType::SpawnObject => {
            SpawnObjectPayload::deserialize(&cmd.payload)
                .map(|_| ())
                .map_err(|e| e.to_string())
        }
        CommandType::ClearWorkspace => {
            ClearWorkspacePayload::deserialize(&cmd.payload)
                .map(|_| ())
                .map_err(|e| e.to_string())
        }
        CommandType::Ping | CommandType::TeleopJointTarget => Ok(()),
    }
}

const MIN_COMMAND_INTERVAL: std::time::Duration = std::time::Duration::from_millis(50);

/// WebSocket teleoperation endpoint handling handshake, ActiveSession exclusivity,
/// command forwarding to DataFabric, and telemetry streaming back to client.
///
/// # Errors
/// Returns Actix Web Error if WebSocket upgrade negotiation fails.
#[allow(clippy::unused_async, clippy::future_not_send, clippy::too_many_lines)]
pub async fn teleop_ws(
    req: HttpRequest,
    stream: web::Payload,
    path: web::Path<String>,
    registry: web::Data<ActiveSessionRegistry>,
    fabric: web::Data<DataFabricPort>,
) -> Result<HttpResponse, actix_web::Error> {
    let robot_id = path.into_inner();

    // 1. Enforce ActiveSession exclusivity per robot ID
    let guard = match registry.try_acquire(&robot_id) {
        Ok(g) => g,
        Err(SessionError::Conflict(id)) => {
            warn!("Rejected concurrent teleoperation session for robot '{id}': 409 Conflict");
            return Ok(HttpResponse::Conflict()
                .insert_header(("Access-Control-Allow-Origin", "*"))
                .body(format!("Active session already exists for robot '{id}'")));
        }
        Err(SessionError::InvalidRobotId(id)) => {
            warn!("Rejected invalid robot ID '{id}': 400 Bad Request");
            return Ok(HttpResponse::BadRequest()
                .insert_header(("Access-Control-Allow-Origin", "*"))
                .body(format!("Invalid robot ID '{id}'")));
        }
    };

    // 2. Perform WebSocket handshake
    let (res, mut session, mut msg_stream) = actix_ws::handle(&req, stream)?;

    // 3. Subscribe to DataFabric telemetry for this robot
    let mut telemetry_rx = match fabric.subscribe_telemetry(&robot_id) {
        Ok(rx) => rx,
        Err(err) => {
            error!("Failed to subscribe to telemetry for robot '{robot_id}': {err}");
            return Ok(HttpResponse::InternalServerError().body("Failed to subscribe to telemetry fabric"));
        }
    };

    let fabric_for_task = web::Data::clone(&fabric);
    let robot_id_for_task = robot_id;

    // 4. Spawn bidirectional streaming task holding session guard
    actix_web::rt::spawn(async move {
        // Hold guard for duration of connection; dropping guard on exit frees session
        let _active_guard: ActiveSessionGuard = guard;
        let mut last_command_time: Option<std::time::Instant> = None;

        loop {
            tokio::select! {
                // Inbound frames from WebSocket client
                msg_opt = msg_stream.next() => {
                    match msg_opt {
                        Some(Ok(Message::Text(text))) => {
                            match serde_json::from_str::<crate::domain::RobotCommand>(&text) {
                                Ok(command) => {
                                    if let Err(val_err) = validate_command_payload(&command) {
                                        warn!("Malformed command payload for robot {robot_id_for_task}: {val_err}");
                                        let error_frame = ErrorFrame::new(
                                            "SCHEMA_VALIDATION_ERROR",
                                            format!("Malformed {:?} payload: {val_err}", command.r#type),
                                            current_time_ns(),
                                        );
                                        if let Ok(err_json) = serde_json::to_string(&error_frame) {
                                            if session.text(err_json).await.is_err() {
                                                break;
                                            }
                                        }
                                    } else if command.r#type != crate::domain::CommandType::EmergencyStop
                                        && last_command_time.is_some_and(|prev| prev.elapsed() < MIN_COMMAND_INTERVAL)
                                    {
                                        warn!("Rate limit exceeded for robot {robot_id_for_task} (20 Hz / 50ms interval)");
                                        let error_frame = ErrorFrame::new(
                                            "RATE_LIMIT_EXCEEDED",
                                            "Command rate limit exceeded (maximum 20 Hz / 50ms minimum interval)",
                                            current_time_ns(),
                                        );
                                        if let Ok(err_json) = serde_json::to_string(&error_frame) {
                                            if session.text(err_json).await.is_err() {
                                                break;
                                            }
                                        }
                                    } else {
                                        if command.r#type == crate::domain::CommandType::EmergencyStop {
                                            last_command_time = None;
                                        } else {
                                            last_command_time = Some(std::time::Instant::now());
                                        }
                                        if let Err(err) = fabric_for_task.publish_command(&robot_id_for_task, &command).await {
                                            error!("Failed to forward command to DataFabric: {err}");
                                        }
                                    }
                                }
                                Err(err) => {
                                    warn!("Malformed RobotCommand received from client: {err}");
                                    let error_frame = ErrorFrame::new(
                                        "SCHEMA_VALIDATION_ERROR",
                                        format!("Malformed RobotCommand payload: {err}"),
                                        current_time_ns(),
                                    );
                                    if let Ok(err_json) = serde_json::to_string(&error_frame) {
                                        if session.text(err_json).await.is_err() {
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                        Some(Ok(Message::Ping(bytes))) => {
                            if session.pong(&bytes).await.is_err() {
                                break;
                            }
                        }
                        Some(Ok(Message::Close(reason))) => {
                            let _ = session.close(reason).await;
                            break;
                        }
                        Some(Ok(_)) => {}
                        Some(Err(e)) => {
                            warn!("WebSocket error for robot {robot_id_for_task}: {e}");
                            break;
                        }
                        None => break,
                    }
                }

                // Inbound telemetry events from DataFabric
                telem_res = telemetry_rx.recv() => {
                    match telem_res {
                        Ok(telem_str) => {
                            if session.text(telem_str).await.is_err() {
                                break;
                            }
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Lagged(missed)) => {
                            warn!("Telemetry receiver lagged by {missed} frames for robot {robot_id_for_task}");
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                            info!("Telemetry stream closed for robot {robot_id_for_task}");
                            break;
                        }
                    }
                }
            }
        }
        info!("WebSocket connection ended for robot: {robot_id_for_task}");
    });

    Ok(res)
}
