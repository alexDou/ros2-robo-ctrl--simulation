---
# hand-sim-cy70
title: 'Unit 9.30: launch the full SIM cell graph'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-10-06T10:38:57Z
updated_at: 2026-10-06T13:21:09Z
parent: hand-sim-rqpy
---

## What to build
robot_nodes.launch.py starts the whole SIM cell graph beside virtual_plc: conveyor_node, flexfeeder_node, four station_node instances (WHITE, GREEN, BLUE, SCRAP) and cell_orchestrator, with virtual_plc on/off and controller host/port arguments (wireframe Step 2.4).

## Acceptance criteria
- [ ] Launch test: every node comes up and cell/state reports EMPTY
- [ ] virtual_plc:=false points the device nodes at an external controller host/port
- [ ] verify: GREEN

Spec + binding decision log: docs_src/specs/unit9/ (D30–D34 added 2026-10-06 after the code review of 194b7ad..507f20b). ADR 0006. Branch: feat/conveyor-devices.

## Summary of Changes

robot_nodes.launch.py starts the whole cell graph: conveyor, flexfeeder, station_{white,green,blue,scrap} (unique node names, station parameter) and cell_orchestrator, all pointed at controller_host:controller_port; virtual_plc only in SIM (use_virtual_plc). robot_bringup depends on cell_orchestrator.
Tests: composition (7 cell nodes; host/port with virtual_plc on and off). Manual smoke: ros2 launch on a scratch domain started all 15 processes, none died, /cell/state reported EMPTY and /conveyor/status was live. The full flow end to end stays with hand-sim-k9xh. verify: GREEN.
