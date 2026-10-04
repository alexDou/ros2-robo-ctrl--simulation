---
# hand-sim-m1za
title: 'Unit 9.19: Stop and EmergencyStop across all devices'
status: todo
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-10-04T13:30:40Z
updated_at: 2026-10-04T13:36:35Z
parent: hand-sim-rqpy
blocked_by:
    - hand-sim-2hi0
---

## What to build

CELL_STOP: belt + FlexFeeder freeze, in-flight SortCycle (incl. PalletExchange) and any BinExchange complete, Process resumes. EmergencyStop: RobotState FAULT as today plus FREEZE of every device; ConveyorStatus FAULT.

Spec + binding decision log: support_files/specs/unit9/ (overview.md, implementation_wireframe.md). ADR 0006. Branch: feat/conveyor-devices.

## Acceptance criteria

- [ ] Pytest: Stop completes in-flight work then STOPPED; resume continues
- [ ] EmergencyStop freezes belt, feeder, lanes, bin
- [ ] verify: GREEN

## Blocked by

- hand-sim-2hi0 (17)
