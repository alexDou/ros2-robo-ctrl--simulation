//! WebSocket gateway integration tests, one module per concern.
//! Verbatim split of the former `ws_gateway_test.rs`; no logic changed.

#[path = "ws_gateway/handshake.rs"]
mod handshake;
#[path = "ws_gateway/handshake_retry.rs"]
mod handshake_retry;
#[path = "ws_gateway/messaging.rs"]
mod messaging;
#[path = "ws_gateway/pick_place.rs"]
mod pick_place;
#[path = "ws_gateway/rate_limit.rs"]
mod rate_limit;
#[path = "ws_gateway/spawn_clear.rs"]
mod spawn_clear;
#[path = "ws_gateway/support.rs"]
mod support;
#[path = "ws_gateway/teleop_reject.rs"]
mod teleop_reject;
#[path = "ws_gateway/teardown.rs"]
mod teardown;
#[path = "ws_gateway/telemetry.rs"]
mod telemetry;
