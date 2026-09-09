---
# hand-sim-hadi
title: 'Unit 1.5: Playwright End-to-End Suite & Multi-Service Integration Verification'
status: todo
type: task
tags:
    - ready-for-agent
created_at: 2026-09-09T15:14:16Z
updated_at: 2026-09-09T15:14:16Z
parent: hand-sim-e8n5
blocked_by:
    - hand-sim-bplp
    - hand-sim-h25q
    - hand-sim-qxif
---

## Parent

hand-sim-2ihi

## What to build

Create an automated end-to-end integration harness and Playwright test suite verifying the complete distributed loop across TeleopClient, Gateway, and EdgeNode. Configure Playwright in the project workspace with multi-service lifecycle management (launching Gateway, EdgeNode, and TeleopClient Vite server). Assert that when an operator clicks "Ping" in the browser, the command traverses Gateway and DataFabric, prints inside the running ROS2 node terminal, and appends the acknowledged RobotTelemetryEvent to the UI event log. Verify duplicate browser sessions attempting connection to the same robot receive an HTTP 409 Conflict, and verify invalid frames receive structured ERROR diagnostics in the UI without dropping the connection.

## Acceptance criteria

- [ ] Playwright test suite configured and executable with a single command.
- [ ] Test harness manages startup, health checking, and graceful shutdown of Gateway, EdgeNode, and TeleopClient.
- [ ] E2E Test 1: Operator opens TeleopClient, clicks "Ping", and verifies DOM event log updates with confirmation RobotTelemetryEvent while ROS2 node logs command receipt.
- [ ] E2E Test 2: Second browser instance connects to `/ws/teleop/robot/0` and is rejected with 409 Conflict; UI reflects conflict state.
- [ ] E2E Test 3: Raw malformed frame injected onto the connection returns structured ERROR frame to event log without terminating WebSocket session.
- [ ] CI/CLI test command exits cleanly with zero errors.

## Blocked by

- hand-sim-rk7e (Unit 1.2: Gateway Actix-Web Boundary & ActiveSession Mediation)
- hand-sim-6vxq (Unit 1.3: EdgeNode ROS2 Node & DataFabric Command Ingestion)
- hand-sim-esw0 (Unit 1.4: TeleopClient Ping-Pong Interface & Real-Time Event Log)
