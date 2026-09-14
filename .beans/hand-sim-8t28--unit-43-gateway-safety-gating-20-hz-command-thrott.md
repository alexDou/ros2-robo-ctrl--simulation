---
# hand-sim-8t28
title: 'Unit 4.3: Gateway Safety Gating & 20 Hz Command Throttling'
status: todo
type: task
tags:
    - ready-for-agent
created_at: 2026-09-14T15:17:33Z
updated_at: 2026-09-14T15:17:33Z
parent: hand-sim-lm3u
blocked_by:
    - hand-sim-kiai
---

## Parent

hand-sim-lm3u

## What to build

Implement transport-level safety gating and command rate throttling inside the Rust `Gateway` service. Protect the `DataFabric` by enforcing a 20 Hz minimum-interval throttle (50ms) per `ActiveSession`. If a client sends non-emergency commands faster than 20 Hz, reject the excess command by returning a structured `ErrorFrame` (`error_code: "RATE_LIMIT_EXCEEDED"`) over WebSocket without dropping or restarting the WebSocket session. Grant `EMERGENCY_STOP` unconditional, zero-latency bypass through the rate limiter while resetting the session's throttle interval clock. Validate incoming commands against Serde schemas and reject malformed payloads with structured `ErrorFrame` responses.

## Acceptance criteria

- [ ] `Gateway` enforces a 50ms minimum interval between inbound non-emergency commands per `ActiveSession`.
- [ ] Commands exceeding the 20 Hz rate limit trigger an outbound `ErrorFrame` with `error_code: "RATE_LIMIT_EXCEEDED"` over WebSocket while keeping the connection open.
- [ ] `EMERGENCY_STOP` commands bypass rate limiting unconditionally and reset the throttle timer.
- [ ] Malformed or invalid command payloads return structured schema validation error frames without dropping the connection.
- [ ] Cargo nextest unit tests in `src/gateway/tests/ws_gateway_test.rs` verify rate limiting, emergency stop bypass, error frame emission, and session durability.

## Blocked by

- hand-sim-kiai (Unit 4.0: Domain Schemas & Palm Actuation Contracts)
