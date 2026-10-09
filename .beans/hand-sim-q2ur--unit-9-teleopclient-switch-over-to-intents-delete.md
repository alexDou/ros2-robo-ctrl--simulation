---
# hand-sim-q2ur
title: 'Unit 9.11: TeleopClient switch-over to intents (delete browser sequencer)'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-10-04T13:30:39Z
updated_at: 2026-10-05T15:37:52Z
parent: hand-sim-rqpy
blocked_by:
    - hand-sim-xhsn
---

## What to build

Delete the browser deck, conveyor controller and belt feeder; the conveyor hook becomes intents + gating derived from cell_state (Fill in EMPTY, Process in LOADED/STOPPED, Stop in FEEDING/HALTED). Browser no longer sends SPAWN_OBJECT / PICK_AND_PLACE_TARGET. Scene renders Pallets at PalletStations.

Spec + binding decision log: docs_src/specs/unit9/ (overview.md, implementation_wireframe.md). ADR 0006. Branch: feat/conveyor-devices.

## Acceptance criteria

- [ ] Deleted modules and their tests gone; no client-side sequencing remains
- [ ] vitest: button gating per ConveyorStatus
- [ ] E2E mock gateway updated so existing scenarios pass
- [ ] verify: GREEN

## Blocked by

- hand-sim-xhsn (10)

Browser sequencer deleted; gating in conveyorGating.ts; E2E mock gained MockCell (CELL_* intents). Not done: Pallet scene rendering (no pallet state on the wire yet).
