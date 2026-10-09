---
# hand-sim-145j
title: 'Unit 9.21: flush reset (RESETTING) in ROS'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-10-04T13:30:40Z
updated_at: 2026-10-06T09:00:42Z
parent: hand-sim-rqpy
blocked_by:
    - hand-sim-32pz
---

## What to build

CLEAR_WORKSPACE and RESET_FAULT trigger RESETTING: cancel SortCycle, decide held-Gearwheel handling (proposal: release over ScrapBin), arm HOME, FlexFeeder quick-empty, belt flush, exchange non-empty Pallets and bin, clear WorkcellState → EMPTY. Same sequence in SIM and LIVE.

Spec + binding decision log: docs_src/specs/unit9/ (overview.md, implementation_wireframe.md). ADR 0006. Branch: feat/conveyor-devices.

## Acceptance criteria

- [ ] Pytest: reset from mid-run and from FAULT ends EMPTY with all stations HOME and counts 0
- [ ] Held-Gearwheel case covered
- [ ] verify: GREEN

## Blocked by

- hand-sim-32pz (20)

Implemented as orchestrator cell/reset (CellReset.srv) + EdgeNode mapping of CLEAR_WORKSPACE/RESET_FAULT. Held-Gearwheel decision: the in-flight SortCycle is awaited (arm ends HOME, Gearwheel lands on its Pallet, Pallet exchanged) rather than cancelled, because the arm has no home-only/release primitive. Not covered: re-homing an arm left mid-air by an EmergencyStop-aborted cycle.
