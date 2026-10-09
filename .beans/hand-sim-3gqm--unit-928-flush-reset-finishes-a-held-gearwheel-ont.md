---
# hand-sim-3gqm
title: 'Unit 9.28: flush reset finishes a held Gearwheel onto its Pallet'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-10-06T10:38:56Z
updated_at: 2026-10-06T11:30:00Z
parent: hand-sim-rqpy
blocked_by:
    - hand-sim-y16q
---

## What to build
D32: when the flush starts with the DexterousPalm holding a Gearwheel (arm frozen by EmergencyStop), the arm completes the drop on its colour's Pallet (CommitDrop), then goes HOME. Needs a place-only motion on arm_controller (no pick phase).

## Acceptance criteria
- [ ] arm_controller supports a place-only goal from the current pose
- [ ] Reset after EmergencyStop mid-transport: Gearwheel committed to its Pallet, arm HOME, Pallet exchanged
- [ ] verify: GREEN

Spec + binding decision log: docs_src/specs/unit9/ (D30–D34 added 2026-10-06 after the code review of 194b7ad..507f20b). ADR 0006. Branch: feat/conveyor-devices.

## Summary of Changes

- PickAndPlace.action gains place_only; arm_controller skips APPROACHING/PICKING/GRASPING/LIFTING and carries the held Gearwheel from the current pose to the drop (6 points), test added.
- Orchestrator: a cycle that ends after GRASPING without a committed drop reports HELD; the flush reset's DRAIN step places it (run_place → CommitDrop), then flushes; its Pallet is then exchanged. A failed place faults PLACE_FAILED; the cycle the E-stop cut short never faults the reset. 3 tests.
- Edge (race found): CLEAR_WORKSPACE was refused (ROBOT_BUSY) when it arrived during reconnect ENGAGE homing, so the connect-time flush could silently not happen. Now it is accepted and the cell reset is sent once homing is done (bounded wait), so the place never competes with homing. Test added.
- verify: GREEN.
