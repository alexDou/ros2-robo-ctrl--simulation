---
# hand-sim-iy13
title: 'Unit 2.2: Gateway High-Throughput 30 Hz Telemetry Multiplexing'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-11T16:02:08Z
updated_at: 2026-09-11T21:29:26Z
parent: hand-sim-8n0g
blocked_by:
    - hand-sim-awta
---

## Parent

hand-sim-8n0g

## What to build

Implement high-throughput asynchronous 30 Hz telemetry forwarding in Gateway. Enhance the background DataFabric subscriber for `robot/{id}/telemetry` to multiplex high-frequency JSON frames directly to the active WebSocket session (`ActiveSession`) for that robot instance. Dimension bounded channel queues to ensure zero frame dropping and sub-millisecond dispatch latency under sustained 30 Hz throughput. Ensure clean lifecycle management that gracefully tears down subscription workers and flushes pending frames when an active browser session disconnects.

## Acceptance criteria

- [ ] Gateway DataFabric subscriber ingests continuous 30 Hz `RobotTelemetryEvent` frames asynchronously.
- [ ] Arriving telemetry frames are forwarded non-blockingly to the corresponding `ActiveSession` WebSocket channel.
- [ ] Bounded channel buffers prevent memory growth while ensuring zero frame drops under standard 30 Hz load.
- [ ] Disconnecting WebSocket clients trigger clean teardown of associated streaming workers without deadlocks.
- [ ] Rust integration tests in `cargo nextest` verify 30 Hz streaming throughput and session lifecycle management against a mock DataFabric.

## Blocked by

- hand-sim-awta (Unit 2.0: Domain Schemas & Canonical Joint Constants Sync)
