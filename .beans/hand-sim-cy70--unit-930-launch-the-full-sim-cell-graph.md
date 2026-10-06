---
# hand-sim-cy70
title: 'Unit 9.30: launch the full SIM cell graph'
status: todo
type: task
tags:
    - ready-for-agent
created_at: 2026-10-06T10:38:57Z
updated_at: 2026-10-06T10:38:57Z
parent: hand-sim-rqpy
---

## What to build
robot_nodes.launch.py starts the whole SIM cell graph beside virtual_plc: conveyor_node, flexfeeder_node, four station_node instances (WHITE, GREEN, BLUE, SCRAP) and cell_orchestrator, with virtual_plc on/off and controller host/port arguments (wireframe Step 2.4).

## Acceptance criteria
- [ ] Launch test: every node comes up and cell/state reports EMPTY
- [ ] virtual_plc:=false points the device nodes at an external controller host/port
- [ ] verify: GREEN

Spec + binding decision log: support_files/specs/unit9/ (D30–D34 added 2026-10-06 after the code review of 194b7ad..507f20b). ADR 0006. Branch: feat/conveyor-devices.
