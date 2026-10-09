---
# hand-sim-kmyv
title: 'Unit 9.15: PalletExchange in the orchestrator and WorkcellNode'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-10-04T13:30:39Z
updated_at: 2026-10-05T16:34:56Z
parent: hand-sim-rqpy
blocked_by:
    - hand-sim-xhsn
    - hand-sim-ahr9
---

## What to build

10th drop → PalletStation FULL (no auto-empty) → arm HOME ‖ PalletExchange → ResetStation(colour) → next SortCycle starts only after both. cell_state.stations (name, exchange state, count). IK reach test for every PalletStation drop.

Spec + binding decision log: docs_src/specs/unit9/ (overview.md, implementation_wireframe.md). ADR 0006. Branch: feat/conveyor-devices.

## Acceptance criteria

- [ ] Pytest: FULL at PALLET_CAPACITY, next SortCycle waits for HOME and exchange
- [ ] ResetStation zeroes only that colour
- [ ] IK reach test green
- [ ] verify: GREEN

## Blocked by

- hand-sim-xhsn (10)
- hand-sim-ahr9 (14)

Done: WorkcellNode no longer auto-empties a full Pallet (10th commit flags overflow_occurred = FULL) and gains ResetStation (WHITE/GREEN/BLUE only, SCRAP comes with BinExchange). Orchestrator runs StationExchange then ResetStation after the 10th drop before the next SortCycle (arm is already HOME when PickAndPlace returns); Stop lets it finish; failures -> FAULT. CellState.stations (optional) = name, exchange_state, count (counts from workcell/state). IK reach: existing test_every_rear_stand_tower_drop_solves covers every PalletStation slot 0-9.
