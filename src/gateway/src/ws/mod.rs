//! WebSocket teleoperation endpoint.

mod handshake;
mod validation;

pub(super) use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

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

use self::handshake::{HANDSHAKE_MAX_RETRIES, HANDSHAKE_RETRY_INTERVAL};
use self::validation::{validate_command_payload, MIN_COMMAND_INTERVAL};

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

    // 3. Subscribe to DataFabric telemetry and action feedback for this robot
    let mut telemetry_rx = match fabric.subscribe_telemetry(&robot_id) {
        Ok(rx) => rx,
        Err(err) => {
            error!("Failed to subscribe to telemetry for robot '{robot_id}': {err}");
            return Ok(
                HttpResponse::InternalServerError().body("Failed to subscribe to telemetry fabric")
            );
        }
    };

    let mut action_feedback_rx = match fabric.subscribe_action_feedback(&robot_id) {
        Ok(rx) => Some(rx),
        Err(err) => {
            warn!("Failed to subscribe to action feedback for robot '{robot_id}': {err}");
            None
        }
    };

    let fabric_for_task = web::Data::clone(&fabric);
    let robot_id_for_task = robot_id;

    // 4. Spawn bidirectional streaming task holding session guard
    actix_web::rt::spawn(async move {
        // Hold guard for duration of connection; dropping guard on exit frees session
        let _active_guard: ActiveSessionGuard = guard;
        let mut last_command_time: Option<std::time::Instant> = None;

        // Handshake: EdgeNode idles in STANDBY until Gateway forwards ENGAGE.
        // Bounded retry: a slow EdgeBridge may miss the first ENGAGE, so retry
        // until telemetry shows the arm left parked state (anything but STANDBY).
        let handshake_done = Arc::new(AtomicBool::new(false));
        let handshake_engaged = Arc::new(AtomicBool::new(false));
        let engage_cmd = self::handshake::engage_command(&robot_id_for_task);
        if let Err(err) = fabric_for_task
            .publish_command(&robot_id_for_task, &engage_cmd)
            .await
        {
            warn!("Failed to forward ENGAGE handshake for robot {robot_id_for_task}: {err}");
        }
        let retry_fabric = web::Data::clone(&fabric_for_task);
        let retry_robot_id = robot_id_for_task.clone();
        let retry_done = Arc::clone(&handshake_done);
        let retry_engaged = Arc::clone(&handshake_engaged);
        let retry_handle = tokio::spawn(async move {
            for attempt in 1..=HANDSHAKE_MAX_RETRIES {
                tokio::time::sleep(HANDSHAKE_RETRY_INTERVAL).await;
                if retry_engaged.load(Ordering::SeqCst) {
                    info!(
                        "ENGAGE handshake acknowledged for robot {retry_robot_id}; stopping retries"
                    );
                    return;
                }
                if retry_done.load(Ordering::SeqCst) {
                    return;
                }
                let retry_cmd = self::handshake::engage_command(&retry_robot_id);
                match retry_fabric.publish_command(&retry_robot_id, &retry_cmd).await {
                    Ok(()) => info!(
                        "Retried ENGAGE handshake for robot {retry_robot_id} (attempt {attempt}/{HANDSHAKE_MAX_RETRIES})"
                    ),
                    Err(err) => warn!(
                        "Failed to retry ENGAGE handshake for robot {retry_robot_id} (attempt {attempt}): {err}"
                    ),
                }
            }
            if retry_engaged.load(Ordering::SeqCst) {
                info!("ENGAGE handshake acknowledged for robot {retry_robot_id}; stopping retries");
            } else {
                warn!(
                    "ENGAGE handshake retries exhausted for robot {retry_robot_id} ({HANDSHAKE_MAX_RETRIES} attempts); arm may still be parked"
                );
            }
        });

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

                                        if command.r#type == crate::domain::CommandType::PickAndPlaceTarget {
                                            use serde::Deserialize;
                                            if let Ok(payload) = crate::domain::PickAndPlaceTargetPayload::deserialize(&command.payload) {
                                                let use_custom_drop = payload.drop_x.is_some() && payload.drop_y.is_some() && payload.drop_z.is_some();
                                                let goal = crate::action::PickAndPlaceGoal {
                                                    pick_coords: crate::action::ActionPoint::new(
                                                        payload.pick_x,
                                                        payload.pick_y,
                                                        payload.pick_z,
                                                    ),
                                                    drop_coords: crate::action::ActionPoint::new(
                                                        payload.drop_x.unwrap_or(0.40),
                                                        payload.drop_y.unwrap_or(-0.30),
                                                        payload.drop_z.unwrap_or(0.0),
                                                    ),
                                                    use_custom_drop,
                                                    command_id: command.command_id.clone(),
                                                };
                                                if let Err(err) = fabric_for_task.publish_action_goal(&robot_id_for_task, &goal).await {
                                                    error!("Failed to forward PickAndPlace action goal: {err}");
                                                }
                                            }
                                        }

                                        // Unit 7.2 (hand-sim-6n92): spawn path only. Blind payload
                                        // already validated above; classify then publish enriched.
                                        // Swap this line for a real inspection source (7.4 seeds via it).
                                        let mut command = command;
                                        if command.r#type == crate::domain::CommandType::SpawnObject {
                                            use crate::qc_classifier::{QcClassifier, RandomQcClassifier, enrich_spawn_payload};
                                            let mut classifier = RandomQcClassifier::default();
                                            command.payload = enrich_spawn_payload(
                                                command.payload,
                                                classifier.classify(),
                                            );
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
                            if let Ok(telem) = serde_json::from_str::<crate::domain::RobotTelemetryEvent>(&telem_str) {
                                if telem.robot_state != crate::domain::RobotState::Standby
                                    && !handshake_engaged.swap(true, Ordering::SeqCst)
                                {
                                    info!(
                                        "Arm {:?} left parked state for robot {robot_id_for_task}; ENGAGE acknowledged",
                                        telem.robot_state
                                    );
                                }
                            }
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

                // Inbound Action feedback frames forwarded to TeleopClient
                feedback_res = async {
                    match action_feedback_rx.as_mut() {
                        Some(rx) => rx.recv().await,
                        None => std::future::pending().await,
                    }
                } => {
                    match feedback_res {
                        Ok(fb_frame) => {
                            if let Ok(fb_json) = serde_json::to_string(&fb_frame) {
                                if session.text(fb_json).await.is_err() {
                                    break;
                                }
                            }
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Lagged(missed)) => {
                            warn!("Action feedback receiver lagged by {missed} frames for robot {robot_id_for_task}");
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                            info!("Action feedback stream closed for robot {robot_id_for_task}; dropping feedback receiver");
                            action_feedback_rx = None;
                        }
                    }
                }
            }
        }
        // Abort retries (no await: awaiting delays session release); STANDBY then publishes exactly once.
        retry_handle.abort();
        handshake_done.store(true, Ordering::SeqCst);
        let standby_cmd = self::handshake::standby_command(&robot_id_for_task);
        if let Err(err) = fabric_for_task
            .publish_command(&robot_id_for_task, &standby_cmd)
            .await
        {
            warn!("Failed to forward STANDBY handshake for robot {robot_id_for_task}: {err}");
        }
        info!("WebSocket connection ended for robot: {robot_id_for_task}");
    });

    Ok(res)
}
