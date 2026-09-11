---
# hand-sim-6vku
title: 'Unit 2.3: TeleopClient TelemetryMonitor Showcase & Direct DOM Ingestion'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-11T16:02:15Z
updated_at: 2026-09-11T21:31:29Z
parent: hand-sim-8n0g
blocked_by:
    - hand-sim-awta
---

## Parent

hand-sim-8n0g

## What to build

Implement the real-time telemetry observation interface in TeleopClient (`web/`). Create a non-reactive ingestion hook (`useTelemetryStream`) storing high-frequency `ArmJointPositions` in a mutable reference buffer. Implement the `TelemetryMonitor` showcase component, binding direct DOM element references to joint angle readouts and painting coordinates directly in a `requestAnimationFrame` loop to eliminate Preact Virtual-DOM diffing overhead during 30 Hz streaming. Provide a rolling 1-second streaming frequency indicator (Hz) and packet latency counter. Automatically remove "Verify connection" / Ping controls from the DOM once an active telemetry stream is detected, preserving them only during disconnected or pre-stream states.

## Acceptance criteria

- [ ] Inbound WebSocket `RobotTelemetryEvent` frames populate a mutable non-reactive reference buffer at 30 Hz.
- [ ] Direct DOM text node updates inside `requestAnimationFrame` paint 6 joint values (radians and degrees) without triggering Preact VDOM re-renders.
- [ ] Component transitions cleanly to `CONNECTED / IDLE` upon initial telemetry frame receipt.
- [ ] UI displays a rolling frequency counter (~30 Hz) and packet latency indicator (< 50ms).
- [ ] Stream-aware cleanup: "Verify connection" / Ping controls are removed from the DOM while telemetry is actively streaming.
- [ ] Vitest unit tests verify non-reactive buffer ingestion, state transitions, and stream-aware DOM behavior.

## Blocked by

- hand-sim-awta (Unit 2.0: Domain Schemas & Canonical Joint Constants Sync)
