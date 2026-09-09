---
# hand-sim-qxif
title: 'Unit 1.4: TeleopClient Ping-Pong Interface & Real-Time Event Log'
status: todo
type: task
tags:
    - ready-for-agent
created_at: 2026-09-09T15:14:13Z
updated_at: 2026-09-09T15:14:13Z
parent: hand-sim-e8n5
blocked_by:
    - hand-sim-myia
---

## Parent

hand-sim-2ihi

## What to build

Implement the browser-based TeleopClient application in Preact (`web/`). Manage WebSocket connection to the Gateway endpoint `/ws/teleop/robot/{id}` with reconnect handling and connection lifecycle states (`CONNECTING`, `CONNECTED`, `DISCONNECTED`, `CONFLICT`). Provide clear UI feedback if an HTTP 409 Conflict occurs due to another active session. Render a "Ping" button that dispatches a structured `PING` RobotCommand over the socket. Ingest incoming RobotTelemetryEvent and ERROR frames, appending them immediately to a scrollable real-time event log list in the DOM.

## Acceptance criteria

- [ ] TeleopClient establishes and maintains WebSocket connection to `/ws/teleop/robot/{id}`.
- [ ] UI displays an active connection lifecycle badge and displays an error banner if connection is rejected with 409 Conflict.
- [ ] Clicking "Ping" button constructs and transmits a valid `PING` RobotCommand frame with UUID and timestamp.
- [ ] Inbound RobotTelemetryEvent frames append immediately to the visual event log with timestamp, state, and joint positions.
- [ ] Inbound ERROR frames append to the event log highlighted as error diagnostics without clearing existing logs.
- [ ] Component and unit tests in Vitest with `@testing-library/preact` verify UI rendering, button click dispatch, and event log updates upon receiving simulated frames.

## Blocked by

- hand-sim-1sc2 (Unit 1.1: Domain Schemas & DataFabric Contract Baseline)
