---
# hand-sim-bplp
title: 'Unit 1.2: Gateway Actix-Web Boundary & ActiveSession Mediation'
status: todo
type: task
tags:
    - ready-for-agent
created_at: 2026-09-09T15:14:07Z
updated_at: 2026-09-09T15:14:07Z
parent: hand-sim-e8n5
blocked_by:
    - hand-sim-myia
---

## Parent

hand-sim-2ihi

## What to build

Implement the Gateway boundary service in Rust using Actix-Web and Actix-Ws, terminating client WebSocket connections and translating them to the Zenoh DataFabric. Expose the RESTful WebSocket route `/ws/teleop/robot/{id}`. Enforce ActiveSession exclusivity per robot ID so that any duplicate connection attempt returns HTTP 409 Conflict. Automatically release the session on client disconnect. Validate incoming frames against the RobotCommand schema, forwarding valid commands to Zenoh key `robot/{id}/command`. For invalid payloads, return a structured ERROR frame over the socket without terminating the connection. Subscribe to Zenoh key `robot/{id}/telemetry` and forward incoming RobotTelemetryEvent frames to the active WebSocket client.

## Acceptance criteria

- [ ] Route `/ws/teleop/robot/{id}` accepts valid WebSocket upgrades for authorized robot IDs.
- [ ] ActiveSession registry enforces single active controller per robot; subsequent upgrade requests return HTTP 409 Conflict.
- [ ] Closing or dropping the WebSocket connection cleans up the ActiveSession immediately.
- [ ] Inbound frames are validated as RobotCommand; valid frames are published to Zenoh `robot/{id}/command`.
- [ ] Malformed inbound frames cause the Gateway to emit a structured ERROR frame to the client without terminating the connection.
- [ ] Telemetry published to Zenoh `robot/{id}/telemetry` is forwarded as text frames to the connected WebSocket client.
- [ ] Unit and integration tests in `cargo nextest` verify handshake, duplicate 409 rejection, command forwarding, error framing, and telemetry broadcast.

## Blocked by

- hand-sim-1sc2 (Unit 1.1: Domain Schemas & DataFabric Contract Baseline)
