---
# hand-sim-yopr
title: 'Refactor-A.5: Multi-Service Integration Suite & Prototype Migration'
status: todo
type: task
tags:
    - ready-for-agent
created_at: 2026-09-17T12:32:42Z
updated_at: 2026-09-17T12:32:42Z
parent: hand-sim-wt44
blocked_by:
    - hand-sim-bjcw
    - hand-sim-gp9z
---

## Parent

hand-sim-wt44

## What to build

Multi-service Playwright integration suite running robot_bringup, launch_gateway.sh, and launch_web.sh. Validates end-to-end closed loop (table click -> Action goal -> 500 Hz motion -> SpindleTower stacking -> 30 Hz telemetry with <50ms latency budget). Retires legacy prototype in src/edge_node/.

## Acceptance criteria

- [ ] scripts/launch_web.sh boots Vite dev server
- [ ] Integration test harness in web/tests/e2e/ orchestrates robot_bringup, launch_gateway.sh, and launch_web.sh
- [ ] Table click dispatches target, moves manipulator through 10-step sequence in 500 Hz simulation, and stacks gear on SpindleTower
- [ ] Confirms real-time telemetry latency remains below 50ms
- [ ] Deprecated prototype files in src/edge_node/ retired and removed cleanly
- [ ] Full project test suite (cargo test, colcon test, vitest) passes green

## Blocked by

- hand-sim-bjcw (Refactor-A.3)
- hand-sim-gp9z (Refactor-A.4)
