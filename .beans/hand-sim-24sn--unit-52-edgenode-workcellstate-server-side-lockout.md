---
# hand-sim-24sn
title: 'Unit 5.2: EdgeNode WorkcellState & Server-Side Lockout Enforcement'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-15T22:29:14Z
updated_at: 2026-09-16T11:49:00Z
parent: hand-sim-7w33
blocked_by:
    - hand-sim-tuyu
---

## Parent
hand-sim-7w33

## What to build
In-process WorkcellState domain tracker inside EdgeNode to record active gear presence and coordinates, enforce SingleCommandGating and server-side placement lockout, and handle CLEAR_WORKSPACE commands cleanly per ADR 0002.

## Acceptance criteria
- [x] WorkcellState module tracks active gear presence and coordinates
- [x] SPAWN_OBJECT stores coordinates when RobotState is IDLE and no gear is present
- [x] SPAWN_OBJECT rejected with error if RobotState is not IDLE or gear already active
- [x] CLEAR_WORKSPACE resets active gear state when RobotState is IDLE
- [x] EdgeNode unit tests pass verifying state transitions, lockout enforcement, and workspace reset

## Blocked by
- hand-sim-tuyu (Unit 5.0)

## Implementation Summary
- Created `src/edge_node/workcell.py` implementing thread-safe `WorkcellState` with internal `threading.Lock()`, immutable `@dataclass(frozen=True)` `ActiveGear`, and coordinate finiteness validation.
- Integrated `WorkcellState` into `EdgeNode` in `src/edge_node/node.py`:
  - `SPAWN_OBJECT`: validated against `SpawnObjectPayload`, rejected with `ROBOT_BUSY` when robot is not `IDLE`, rejected with `WORKCELL_OCCUPIED` if a gear is already present, and rejected with `INVALID_COMMAND_PAYLOAD` on non-finite or malformed coordinates.
  - `CLEAR_WORKSPACE`: validated against `ClearWorkspacePayload`, rejected with `ROBOT_BUSY` when robot is not `IDLE`, and resets workcell state to permit subsequent spawns when `IDLE`.
- Added unit tests in `tests/test_edge_node.py` verifying state transitions, concurrent lockout semantics, immutability, non-finite coordinate handling, and workspace reset.
