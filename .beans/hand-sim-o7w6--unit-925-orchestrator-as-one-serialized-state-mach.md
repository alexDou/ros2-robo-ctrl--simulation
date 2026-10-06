---
# hand-sim-o7w6
title: 'Unit 9.25: orchestrator as one serialized state machine, split into modules'
status: todo
type: task
tags:
    - ready-for-agent
created_at: 2026-10-06T10:38:56Z
updated_at: 2026-10-06T10:38:56Z
parent: hand-sim-rqpy
---

## What to build
Split cell_orchestrator/orchestrator_node.py (827 lines) along its seams: cell model + cell_state publishing, belt runs, SortCycle, station exchanges, flush reset, ROS node shell. Every device result, operator intent and reset step becomes an event applied by a single owner (D33), replacing the run_id guards that drop late results.

## Acceptance criteria
- [ ] No module over ~250 lines; node.py is ROS wiring only
- [ ] A device fault during work that Stop or Reset lets finish still ends in FAULT, freeze and a DEVICE_FAULT frame (review finding c1)
- [ ] Flush reset decides the bin exchange from device results (flush exit count), not the async workcell/state snapshot (review finding c3)
- [ ] Regression tests for both races; all existing orchestrator tests green
- [ ] verify: GREEN

Spec + binding decision log: support_files/specs/unit9/ (D30–D34 added 2026-10-06 after the code review of 194b7ad..507f20b). ADR 0006. Branch: feat/conveyor-devices.
