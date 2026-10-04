---
# hand-sim-2hi0
title: 'Unit 9.17: BinExchange in the orchestrator'
status: todo
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-10-04T13:30:40Z
updated_at: 2026-10-04T13:36:35Z
parent: hand-sim-rqpy
blocked_by:
    - hand-sim-mt82
    - hand-sim-kmyv
---

## What to build

At a belt stop with Scrapped ≥ BIN_EXCHANGE_THRESHOLD (now 20) the BinExchange starts and overlaps sorting; next belt run waits for SCRAP HOME (controller interlock). Bin auto-empty at 100 removed. PalletExchange and BinExchange may overlap.

Spec + binding decision log: support_files/specs/unit9/ (overview.md, implementation_wireframe.md). ADR 0006. Branch: feat/conveyor-devices.

## Acceptance criteria

- [ ] Pytest: exchange at belt stop only, overlaps SortCycles
- [ ] Belt held while bin away
- [ ] Pallet + bin exchange overlap allowed
- [ ] verify: GREEN

## Blocked by

- hand-sim-mt82 (12)
- hand-sim-kmyv (15)
