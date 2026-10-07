---
# hand-sim-0k5y
title: 'Unit 9.28: Belt eye stops only for an intact Gearwheel still on the belt; defectives fall into the bin on any run'
status: todo
type: task
tags:
    - ready-for-agent
created_at: 2026-10-07T15:44:37Z
updated_at: 2026-10-07T15:44:37Z
parent: hand-sim-rqpy
---

D35 in support_files/specs/unit9/implementation_wireframe.md. BeltSim: items carry class + placement seq; eye trips only on intact; virtual_plc_node removes a grasped Gearwheel (SIM seam, register map unchanged). Orchestrator registers defectives Rejected at placement. Tests: belt_sim/virtual_plc (full-length second run), orchestrator registration, launch test.
