---
# hand-sim-2hi0
title: 'Unit 9.17: BinExchange in the orchestrator'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-10-04T13:30:40Z
updated_at: 2026-10-05T22:28:48Z
parent: hand-sim-rqpy
blocked_by:
    - hand-sim-mt82
    - hand-sim-kmyv
---

## What to build

At a belt stop with Scrapped ≥ BIN_EXCHANGE_THRESHOLD (now 20) the BinExchange starts and overlaps sorting; next belt run waits for SCRAP HOME (controller interlock). Bin auto-empty at 100 removed. PalletExchange and BinExchange may overlap.

Spec + binding decision log: docs_src/specs/unit9/ (overview.md, implementation_wireframe.md). ADR 0006. Branch: feat/conveyor-devices.

## Acceptance criteria

- [ ] Pytest: exchange at belt stop only, overlaps SortCycles
- [ ] Belt held while bin away
- [ ] Pallet + bin exchange overlap allowed
- [ ] verify: GREEN

## Blocked by

- hand-sim-mt82 (12)
- hand-sim-kmyv (15)

BinExchange in orchestrator: starts at belt stop when Scrapped >= 20, overlaps SortCycles, next belt run waits for bin HOME; ResetStation SCRAP empties the bin; auto-recycle at 100 removed; BIN_EXCHANGE_THRESHOLD=20.
