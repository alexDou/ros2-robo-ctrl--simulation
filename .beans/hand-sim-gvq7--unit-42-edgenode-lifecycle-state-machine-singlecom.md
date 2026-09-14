---
# hand-sim-gvq7
title: 'Unit 4.2: EdgeNode Lifecycle State Machine & SingleCommandGating'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-14T15:17:22Z
updated_at: 2026-09-14T16:06:47Z
parent: hand-sim-lm3u
blocked_by:
    - hand-sim-kiai
---

## Parent

hand-sim-lm3u

## What to build

Implement the authoritative lifecycle state machine (`BOOTING`, `IDLE`, `PROCESSING`, `EXECUTING`, `FAULT`) and `SingleCommandGating` inside `EdgeNode`. Enforce strict single-command gating by accepting motion commands (`TRAJECTORY_EXECUTE`) and actuation commands (`PALM_ACTUATE`) exclusively when `RobotState == IDLE`. When a command arrives while the robot is busy (`PROCESSING` or `EXECUTING`), reject it immediately by emitting a structured `ErrorFrame` (`ROBOT_BUSY`), logging a warning, and continuing current execution without tripping the system into `FAULT`. Implement canned trajectory generation for canonical UR5e poses (`HOME`, `READY`, `INSPECT_POSE`) with a 50ms planning phase and a 2.0-second cubic smooth-step interpolation ($s(t) = 3t^2 - 2t^3$) at 30 Hz. Implement simulated pneumatic delay (200ms) for `PALM_ACTUATE` cycling `IDLE` $\to$ `PROCESSING` $\to$ `IDLE` before updating `palm_state.is_grasped`. Implement immediate motion abort and transition to `FAULT` on `EMERGENCY_STOP`, and safe direct transition from `FAULT` to `IDLE` on `RESET_FAULT` without initiating joint motion.

## Acceptance criteria

- [ ] `EdgeNode` manages authoritative `RobotState` transitions across `BOOTING`, `IDLE`, `PROCESSING`, `EXECUTING`, and `FAULT`.
- [ ] `SingleCommandGating` accepts motion and actuation commands only when state is `IDLE`.
- [ ] Inbound commands arriving during `PROCESSING` or `EXECUTING` are rejected with a structured `ROBOT_BUSY` `ErrorFrame` and warning log, without entering a queue or tripping to `FAULT`.
- [ ] Canned poses (`HOME`, `READY`, `INSPECT_POSE`) interpolate smoothly over 2.0s using cubic smooth-step interpolation at 30 Hz before returning to `IDLE`.
- [ ] `PALM_ACTUATE` executes a 200ms pneumatic delay in `PROCESSING` before updating `palm_state.is_grasped` and returning to `IDLE`.
- [ ] `EMERGENCY_STOP` aborts active motion timers immediately and transitions `RobotState` to `FAULT`.
- [ ] `RESET_FAULT` transitions `FAULT` directly to `IDLE` at the current joint positions without moving the arm.
- [ ] Offline Pytest unit tests in `tests/test_edge_node.py` hermetically assert all state transitions, single-command gating, pneumatic delay, and emergency stop halt.

## Blocked by

- hand-sim-kiai (Unit 4.0: Domain Schemas & Palm Actuation Contracts)

## Summary of Changes

- Implemented authoritative lifecycle state machine (`BOOTING`, `IDLE`, `PROCESSING`, `EXECUTING`, `FAULT`) and `SingleCommandGating` in `src/edge_node/node.py`.
- Inbound motion and actuation commands received while busy are rejected with structured `ErrorFrame` (`ROBOT_BUSY`) without mutating state or entering queues.
- Canned pose trajectories (`HOME`, `READY`, `INSPECT_POSE`) interpolate smoothly with cubic smooth-step interpolation ((u) = 3u^2 - 2u^3$) at 30 Hz.
- Palm actuation commands simulate pneumatic pressurization delay (~200ms) before updating `palm_state.is_grasped`.
- `EMERGENCY_STOP` commands immediately halt motion threads and transition state to `FAULT`.
- `RESET_FAULT` clears faults safely back to `IDLE` at the current pose without uncommanded arm movement.
- Hermetic unit test coverage added to `tests/test_edge_node.py` verifying all state transitions, single-command gating, pneumatic delay, and emergency stop halt.
