---
# hand-sim-yopr
title: 'Refactor-A.5: Mock Gateway E2E Test Harness & UI Suite Migration'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-17T12:32:42Z
updated_at: 2026-09-18T08:52:30Z
parent: hand-sim-wt44
blocked_by:
    - hand-sim-bjcw
    - hand-sim-gp9z
---

## Parent

hand-sim-wt44

## What to build

Implement lightweight MockGateway in Node/TypeScript (web/tests/e2e/support/mock_gateway.ts) to emulate Gateway WebSocket protocol (/ws/teleop/robot/{id}) and HTTP /health. Refactor ServiceHarness and Cucumber hooks to test TeleopClient purely against MockGateway in-process without spawning backend binaries (cargo gateway, ROS2 nodes, mock motion publisher). Add scripts/launch_web.sh for Vite dev server. Migrate existing features (teleop.feature, dynamic_motion.feature, closed_loop.feature, workcell.feature) to run green in seconds.

## Acceptance criteria

- [x] scripts/launch_web.sh boots Vite dev server with signal trap cleanup
- [x] MockGateway implemented in web/tests/e2e/support/mock_gateway.ts supporting WS protocol, 409 conflict, 30 Hz telemetry stream, and command handling
- [x] web/tests/e2e/support/harness.ts and hooks.ts refactored to run hermetically against MockGateway without child processes
- [x] Existing E2E features (teleop, dynamic_motion, closed_loop, workcell) pass reliably in headless mode
- [x] Web test suite (npm --prefix web run test, test:e2e, lint, typecheck) passes 100% green in <5 seconds

## Blocked by

- hand-sim-bjcw (Refactor-A.3)
- hand-sim-gp9z (Refactor-A.4)
