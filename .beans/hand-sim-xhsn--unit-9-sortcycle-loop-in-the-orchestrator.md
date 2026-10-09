---
# hand-sim-xhsn
title: 'Unit 9.10: SortCycle loop in the orchestrator'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-10-04T13:30:39Z
updated_at: 2026-10-05T14:41:13Z
parent: hand-sim-rqpy
blocked_by:
    - hand-sim-ull1
---

## What to build

Orchestrator runs SortCycles in belt order: PickAndPlace to the Gearwheel's colour PalletStation, commit drop, next only after completion. Batch done → arm HOME → next feed run. FlexFeeder empty + last Batch sorted → final flush → EMPTY. PalletStation coordinates = the Unit 8 tower spots.

Spec + binding decision log: docs_src/specs/unit9/ (overview.md, implementation_wireframe.md). ADR 0006. Branch: feat/conveyor-devices.

## Acceptance criteria

- [ ] Pytest with faked PickAndPlace: belt order, one at a time, HOME after Batch
- [ ] Final flush at end of deck
- [ ] verify: GREEN

## Blocked by

- hand-sim-ull1 (09)

Orchestrator runs SortCycles (GetDropSlot -> PickAndPlace with custom drop -> MarkGrasped/CommitDrop) in belt order, one at a time; batch end -> next feed run, or final FLUSH -> EMPTY when feeder empty and nothing waits upstream. Picked Gearwheels leave cell_state.belt_gears. Process from HALTED removed (HALTED is now automatic); Stop mid-Batch finishes the in-flight cycle, Process resumes the Batch.
