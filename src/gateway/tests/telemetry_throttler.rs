//! Throttler + action contract tests, one module per concern.
//! Verbatim split of the former `throttler_action_test.rs`; no logic changed.

#[path = "telemetry_throttler/action_frames.rs"]
mod action_frames;
#[path = "telemetry_throttler/action_relay.rs"]
mod action_relay;
#[path = "telemetry_throttler/throttler_codecs.rs"]
mod throttler_codecs;
#[path = "telemetry_throttler/throttler_sampler.rs"]
mod throttler_sampler;
#[path = "telemetry_throttler/throttler_state.rs"]
mod throttler_state;
