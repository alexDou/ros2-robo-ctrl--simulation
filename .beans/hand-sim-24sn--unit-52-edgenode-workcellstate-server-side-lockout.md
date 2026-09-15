---
# hand-sim-24sn
title: 'Unit 5.2: EdgeNode WorkcellState & Server-Side Lockout Enforcement'
status: todo
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-15T22:29:14Z
updated_at: 2026-09-15T22:29:17Z
parent: hand-sim-7w33
blocked_by:
    - hand-sim-tuyu
---

## Parent
hand-sim-7w33

## What to build
In-process WorkcellState domain tracker inside EdgeNode to record active gear presence and coordinates, enforce SingleCommandGating and server-side placement lockout, and handle CLEAR_WORKSPACE commands cleanly per ADR 0002.

## Acceptance criteria
- [ ] WorkcellState module tracks active gear presence and coordinates
- [ ] SPAWN_OBJECT stores coordinates when RobotState is IDLE and no gear is present
- [ ] SPAWN_OBJECT rejected with error if RobotState is not IDLE or gear already active
- [ ] CLEAR_WORKSPACE resets active gear state when RobotState is IDLE
- [ ] EdgeNode unit tests pass verifying state transitions, lockout enforcement, and workspace reset

## Blocked by
- hand-sim-tuyu (Unit 5.0)
