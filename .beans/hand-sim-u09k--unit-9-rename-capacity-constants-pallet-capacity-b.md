---
# hand-sim-u09k
title: 'Unit 9.02: rename capacity constants (PALLET_CAPACITY, BIN_EXCHANGE_THRESHOLD)'
status: todo
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-10-04T13:30:39Z
updated_at: 2026-10-04T13:36:34Z
parent: hand-sim-rqpy
blocked_by:
    - hand-sim-r966
---

## What to build

Mechanical prefactor: TOWER_CAPACITY → PALLET_CAPACITY and MAX_SCRAP_BIN_CAPACITY → BIN_EXCHANGE_THRESHOLD in schemas, regenerated domain types and every call site (Python, Rust, TS, tests). Values and behaviour unchanged (10 / 100); ticket BinExchange ROS changes the threshold to 20.

Spec + binding decision log: support_files/specs/unit9/ (overview.md, implementation_wireframe.md). ADR 0006. Branch: feat/conveyor-devices.

## Acceptance criteria

- [ ] No reference to the old names remains
- [ ] Codegen --check clean
- [ ] verify: GREEN

## Blocked by

- hand-sim-r966 (01)
