---
# hand-sim-145j
title: 'Unit 9.21: flush reset (RESETTING) in ROS'
status: todo
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-10-04T13:30:40Z
updated_at: 2026-10-04T13:36:35Z
parent: hand-sim-rqpy
blocked_by:
    - hand-sim-32pz
---

## What to build

CLEAR_WORKSPACE and RESET_FAULT trigger RESETTING: cancel SortCycle, decide held-Gearwheel handling (proposal: release over ScrapBin), arm HOME, FlexFeeder quick-empty, belt flush, exchange non-empty Pallets and bin, clear WorkcellState → EMPTY. Same sequence in SIM and LIVE.

Spec + binding decision log: support_files/specs/unit9/ (overview.md, implementation_wireframe.md). ADR 0006. Branch: feat/conveyor-devices.

## Acceptance criteria

- [ ] Pytest: reset from mid-run and from FAULT ends EMPTY with all stations HOME and counts 0
- [ ] Held-Gearwheel case covered
- [ ] verify: GREEN

## Blocked by

- hand-sim-32pz (20)
