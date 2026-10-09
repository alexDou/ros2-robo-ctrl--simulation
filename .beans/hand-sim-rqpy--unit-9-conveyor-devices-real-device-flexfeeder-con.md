---
# hand-sim-rqpy
title: 'Unit 9: Conveyor Devices — real-device FlexFeeder, Conveyor, PalletLanes, BinExchange'
status: todo
type: epic
tags:
    - ready-for-agent
created_at: 2026-10-04T13:30:39Z
updated_at: 2026-10-04T13:30:39Z
---

Spec + binding decision log: docs_src/specs/unit9/ (overview.md, implementation_wireframe.md). ADR 0006. Branch: feat/conveyor-devices.

ROS2 owns the flow (cell_orchestrator + device nodes over a Modbus TCP cell controller; virtual_plc in SIM). See overview.md for problem, solution, user stories, decisions and testing.
