//! Shared helpers for WebSocket gateway integration tests.
//!
//! Hazard these helpers neutralize: the gateway publishes ENGAGE/STANDBY handshake frames
//! (`sender_id == "gateway"`) into the same command broadcast channel the tests observe, and
//! retries ENGAGE every 500ms while the arm looks parked. A retry can land mid-test, so reads
//! expecting a client command must skip gateway frames instead of asserting on the next raw frame.
//!
//! `pub(crate)` here is required by `unreachable_pub` (nothing outside this
//! test binary can see these helpers), which puts it at odds with
//! `redundant_pub_crate`'s "just use `pub`" suggestion for the same items.
#![allow(clippy::redundant_pub_crate)]

use gateway::domain::RobotCommand;
use std::time::Duration;
use tokio::sync::broadcast;

/// Receives the next client command, skipping gateway ENGAGE/STANDBY frames.
pub(crate) async fn recv_client_command(
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
pub(crate) async fn assert_no_client_command(
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
