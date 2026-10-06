---
# hand-sim-3gqm
title: 'Unit 9.28: flush reset finishes a held Gearwheel onto its Pallet'
status: todo
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-10-06T10:38:56Z
updated_at: 2026-10-06T10:39:12Z
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

Spec + binding decision log: support_files/specs/unit9/ (D30–D34 added 2026-10-06 after the code review of 194b7ad..507f20b). ADR 0006. Branch: feat/conveyor-devices.
