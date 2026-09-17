---
# hand-sim-gp9z
title: 'Refactor-A.4: Gateway 500Hz-to-30Hz Telemetry Throttler & Zenoh Action Bridge'
status: todo
type: task
tags:
    - ready-for-agent
created_at: 2026-09-17T12:32:39Z
updated_at: 2026-09-17T12:32:39Z
parent: hand-sim-wt44
blocked_by:
    - hand-sim-glrj
---

## Parent

hand-sim-wt44

## What to build

Gateway launcher scripts/launch_gateway.sh managing zenoh-bridge-ros2dds and Rust Gateway. Gateway TelemetryThrottler sampling 500 Hz DDS /joint_states via Zenoh and decimating to 30 Hz WebSocket stream without frame loss. Translates PICK_AND_PLACE_TARGET WebSocket frames to PickAndPlace.action goals and streams feedback.

## Acceptance criteria

- [ ] scripts/launch_gateway.sh launches zenoh-bridge-ros2dds and cargo run -p gateway, trapping SIGINT/SIGTERM to kill both
- [ ] TelemetryThrottler in src/gateway/src/throttler.rs samples 500 Hz telemetry at non-blocking 33ms (30 Hz) intervals
- [ ] Ingests PICK_AND_PLACE_TARGET from WebSocket, translates to PickAndPlace.action goal over Zenoh, and streams feedback frames to TeleopClient
- [ ] Unit tests in cargo nextest assert 30 Hz decimation rate stability and Action serialization

## Blocked by

- hand-sim-glrj (Refactor-A.0)
