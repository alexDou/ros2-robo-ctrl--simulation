---
# hand-sim-xhsn
title: 'Unit 9.10: SortCycle loop in the orchestrator'
status: todo
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-10-04T13:30:39Z
updated_at: 2026-10-04T13:36:34Z
parent: hand-sim-rqpy
blocked_by:
    - hand-sim-ull1
---

## What to build

Orchestrator runs SortCycles in belt order: PickAndPlace to the Gearwheel's colour PalletStation, commit drop, next only after completion. Batch done → arm HOME → next feed run. FlexFeeder empty + last Batch sorted → final flush → EMPTY. PalletStation coordinates = the Unit 8 tower spots.

Spec + binding decision log: support_files/specs/unit9/ (overview.md, implementation_wireframe.md). ADR 0006. Branch: feat/conveyor-devices.

## Acceptance criteria

- [ ] Pytest with faked PickAndPlace: belt order, one at a time, HOME after Batch
- [ ] Final flush at end of deck
- [ ] verify: GREEN

## Blocked by

- hand-sim-ull1 (09)
