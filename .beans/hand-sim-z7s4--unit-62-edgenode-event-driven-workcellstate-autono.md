---
# hand-sim-z7s4
title: 'Unit 6.2: EdgeNode Event-Driven WorkcellState & Autonomous Trajectory Execution'
status: completed
type: task
tags:
    - ready-for-agent
created_at: 2026-09-16T17:27:05Z
updated_at: 2026-09-17T10:24:00Z
parent: hand-sim-d20p
blocked_by:
    - hand-sim-yilh
---

## Parent
hand-sim-d20p

## What to build
Implement decoupled in-process pub/sub event seam in WorkcellState publishing WorkpieceSpawnedEvent(pick, drop). Track placed items and next vacant SpindleTower stacking height (z_k = k * 0.02m). Subscribe EdgeNode to workpiece events, accept pluggable IK solver seam, execute 10-step sequence on background motion thread with 30 Hz joint interpolation and palm_state toggling, stream telemetry, manage lifecycle transitions (IDLE -> PROCESSING -> EXECUTING -> IDLE), and purge on EMERGENCY_STOP.

## Acceptance criteria
- [x] WorkcellState implements in-process event emitter publishing WorkpieceSpawnedEvent with pick and drop coordinates
- [x] WorkcellState records placed gear inventory and calculates next vacant drop height (z_k = k * 0.02m)
- [x] EdgeNode subscribes to workpiece events and handles PICK_AND_PLACE_TARGET commands when IDLE
- [x] Motion execution thread interpolates waypoints at 30 Hz and actuates palm_state (GRASP at pick, RELEASE at drop)
- [x] State transitions IDLE -> PROCESSING -> EXECUTING -> IDLE emitted in 30 Hz telemetry
- [x] EMERGENCY_STOP halts active motion thread and transitions to FAULT; RESET_FAULT restores IDLE
- [x] CLEAR_WORKSPACE resets active workpiece and placed tower inventory in WorkcellState
- [x] Offline unit tests pass in pytest with mocked kinematics seam

## Blocked by
- hand-sim-yilh (Unit 6.0)
