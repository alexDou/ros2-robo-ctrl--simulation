---
# hand-sim-k9xh
title: 'Unit 9.24: ROS launch test of the full SIM graph'
status: todo
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-10-04T13:30:40Z
updated_at: 2026-10-04T13:36:35Z
parent: hand-sim-rqpy
blocked_by:
    - hand-sim-145j
---

## What to build

Launch test with virtual_plc: Fill → Process → at least one PalletExchange per colour → BinExchange over two decks → reset to EMPTY. Proves the real ROS wiring end to end.

Spec + binding decision log: support_files/specs/unit9/ (overview.md, implementation_wireframe.md). ADR 0006. Branch: feat/conveyor-devices.

## Acceptance criteria

- [ ] Launch test green in CI time budget
- [ ] verify: GREEN

## Blocked by

- hand-sim-145j (21)
