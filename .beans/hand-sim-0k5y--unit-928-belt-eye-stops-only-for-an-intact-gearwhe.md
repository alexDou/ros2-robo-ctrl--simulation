---
# hand-sim-0k5y
title: 'Unit 9.28: Belt eye stops only for an intact Gearwheel still on the belt; defectives fall into the bin on any run'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-10-07T15:44:37Z
updated_at: 2026-10-07T16:49:50Z
parent: hand-sim-rqpy
---

D35 in support_files/specs/unit9/implementation_wireframe.md. BeltSim: items carry class + placement seq; eye trips only on intact; virtual_plc_node removes a grasped Gearwheel (SIM seam, register map unchanged). Orchestrator registers defectives Rejected at placement. Tests: belt_sim/virtual_plc (full-length second run), orchestrator registration, launch test.

Done: BeltSim eye trips only on intact items; virtual_plc_node removes grasped Gearwheels (workcell/state in_progress/processed ids -> placement seq); orchestrator registers defectives Rejected on first belt status. Follow-up arm fix: APPROACH_LIFT_OFFSET_M 0.15 (far-corner lead at y~-0.555 needed it). Full-flow launch test passes. Mock cell follow-up: hand-sim-s14w; nest tray: hand-sim-4jbb.
