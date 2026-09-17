---
# hand-sim-poc1
title: 'Unit 6.5: Multi-Service Closed-Loop System Integration Suite'
status: todo
type: task
tags:
    - ready-for-agent
created_at: 2026-09-16T17:28:21Z
updated_at: 2026-09-16T17:28:21Z
parent: hand-sim-d20p
blocked_by:
    - hand-sim-4igp
    - hand-sim-z7s4
    - hand-sim-i13f
    - hand-sim-6yut
---

## Parent
hand-sim-d20p

## What to build
Automated multi-service E2E integration test suite (Playwright) orchestrating real TeleopClient, Gateway, and EdgeNode processes over DataFabric. Verify complete closed loop: table click dispatches target -> Gateway validates and forwards -> EdgeNode solves analytical IK -> arm moves through waypoints -> gear attached -> gear stacked on SpindleTower -> arm returns to HOME -> IDLE state restored -> ClickLockout lifted -> second click stacks second gear on tower. Verify latency budget <50ms.

## Acceptance criteria
- [ ] Multi-service test harness launches EdgeNode, Gateway, and TeleopClient concurrently
- [ ] Operator clicking reachable table coordinate triggers autonomous pick-and-place motion
- [ ] Manipulator moves through waypoints, grasps gear, deposits on SpindleTower, and returns to HOME
- [ ] Telemetry stream confirms IDLE -> PROCESSING -> EXECUTING -> IDLE lifecycle
- [ ] ClickLockout lifts upon return to IDLE and allows placing/stacking subsequent gears
- [ ] Real-time latency budget <50ms maintained across execution
- [ ] E2E integration test passes reliably in headless CI

## Blocked by
- hand-sim-4igp (Unit 6.1)
- hand-sim-z7s4 (Unit 6.2)
- hand-sim-i13f (Unit 6.3)
- hand-sim-6yut (Unit 6.4)
