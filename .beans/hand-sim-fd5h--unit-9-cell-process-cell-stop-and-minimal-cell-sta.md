---
# hand-sim-fd5h
title: 'Unit 9.05: CELL_PROCESS / CELL_STOP and minimal cell_state through ROS'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-10-04T13:30:39Z
updated_at: 2026-10-04T21:02:17Z
parent: hand-sim-rqpy
blocked_by:
    - hand-sim-u09k
    - hand-sim-kkwu
---

## What to build

Wire + ROS half of the tracer bullet. Schema: CELL_PROCESS, CELL_STOP commands and cell_state (conveyor_status, belt_offset_m); codegen; cross-language contract tests. Minimal cell_orchestrator owning ConveyorStatus, publishing /cell/state on events + belt offset at 5 Hz while moving. EdgeNode maps the commands onto orchestrator services and forwards /cell/state into telemetry like /workcell/state.

Spec + binding decision log: support_files/specs/unit9/ (overview.md, implementation_wireframe.md). ADR 0006. Branch: feat/conveyor-devices.

## Acceptance criteria

- [ ] Contract tests (Py/Rust/TS) for the new commands and cell_state
- [ ] EdgeNode test: CELL_PROCESS runs the SIM belt, telemetry carries cell_state
- [ ] verify: GREEN

## Blocked by

- hand-sim-u09k (02)
- hand-sim-kkwu (04)

Done: CELL_PROCESS/CELL_STOP + cell_state schema, cell_orchestrator package, EdgeNode mapping, throttler sample-hold. Launch wiring left to the launch ticket.
