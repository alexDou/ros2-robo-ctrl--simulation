//! Shared helpers for WebSocket gateway integration tests.
//!
//! Two hazards these helpers neutralize:
//!
//! 1. The gateway publishes ENGAGE/STANDBY handshake frames (`sender_id ==
//!    "gateway") into the same command broadcast channel the tests observe,
//!    and retries ENGAGE every 500ms while the arm looks parked. A retry can
//!    land mid-test, so reads expecting a client command must skip gateway
//!    frames instead of asserting on the next raw frame.
//! 2. The 20 Hz (50ms) rate limiter is timing-sensitive: under parallel load
//!    the server-side gap between two sequentially-awaited commands can exceed
//!    50ms, so the "throttled" command gets forwarded and no error frame ever
//!    arrives. `expect_rate_limited` sends the pair back-to-back (no await in
//!    between) and retries with a settle delay, so a scheduling stall becomes
//!    a retry instead of a failure.

use futures_util::{SinkExt, StreamExt};
use gateway::domain::{ErrorFrame, RobotCommand};
use std::time::Duration;
use tokio::io::{AsyncRead, AsyncWrite};
use tokio::sync::broadcast;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::WebSocketStream;

/// Receives the next client command, skipping gateway ENGAGE/STANDBY frames.
pub(super) async fn recv_client_command(
    rx: &mut broadcast::Receiver<RobotCommand>,
) -> RobotCommand {
    loop {
        let cmd = tokio::time::timeout(Duration::from_millis(2000), rx.recv())
            .await
            .expect("timed out waiting for command")
            .expect("cmd rx");
        if cmd.sender_id != "gateway" {
            return cmd;
        }
    }
}

/// Asserts no client command reached the fabric; gateway handshake frames are ignored.
///
/// Waits briefly first: a throttled/malformed frame may still be in flight
/// (server hasn't processed it yet) when called, so an instant `try_recv`
/// drain can pass vacuously.
pub(super) async fn assert_no_client_command(
    rx: &mut broadcast::Receiver<RobotCommand>,
    msg: &str,
) {
    tokio::time::sleep(Duration::from_millis(100)).await;
    while let Ok(cmd) = rx.try_recv() {
        assert!(
            cmd.sender_id == "gateway",
            "{msg}: throttled/malformed command reached fabric ({})",
            cmd.command_id
        );
    }
}

/// Sends `first` + `second` back-to-back and expects `second` to be rejected
/// with RATE_LIMIT_EXCEEDED. Returns the forwarded `first`.
///
/// The pair is sent with no await in between so the server-side inter-arrival
/// gap stays far below the 50ms limiter window. If a scheduling stall still
/// lets `second` through (no error frame within budget), the forwarded frame
/// is drained and the pair retried after a settle delay (max 3 attempts).
pub(super) async fn expect_rate_limited<S>(
    ws: &mut WebSocketStream<S>,
    rx: &mut broadcast::Receiver<RobotCommand>,
    first: &RobotCommand,
    second: &RobotCommand,
) -> RobotCommand
where
    S: AsyncRead + AsyncWrite + Unpin,
{
    for attempt in 1..=3 {
        ws.send(Message::Text(
            serde_json::to_string(first).expect("serialize first"),
        ))
        .await
        .expect("send first");
        ws.send(Message::Text(
            serde_json::to_string(second).expect("serialize second"),
        ))
        .await
        .expect("send second");

        let got = recv_client_command(rx).await;
        assert_eq!(got.command_id, first.command_id, "attempt {attempt}");

        match tokio::time::timeout(Duration::from_millis(1500), ws.next()).await {
            Ok(Some(Ok(Message::Text(txt)))) => {
                let err: ErrorFrame = serde_json::from_str(&txt).expect("parse error frame");
                assert_eq!(err.r#type, "ERROR");
                assert_eq!(err.error_code, "RATE_LIMIT_EXCEEDED");
                assert_no_client_command(rx, "throttled command must not reach fabric").await;
                return got;
            }
            Ok(other) => panic!("expected RATE_LIMIT_EXCEEDED error frame, got {other:?}"),
            Err(_) => {
                // Stall let `second` through; drain its fabric echo and retry.
                let fwd = recv_client_command(rx).await;
                assert_eq!(fwd.command_id, second.command_id, "attempt {attempt}");
                tokio::time::sleep(Duration::from_millis(150)).await;
            }
        }
    }
    panic!("rate limiter never triggered after 3 attempts");
}
