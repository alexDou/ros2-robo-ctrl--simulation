---
# hand-sim-32pz
title: 'Unit 9.20: device FAULT handling'
status: todo
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-10-04T13:30:40Z
updated_at: 2026-10-04T13:36:35Z
parent: hand-sim-rqpy
blocked_by:
    - hand-sim-m1za
---

## What to build

Drive fault or station timeout → freeze all, ConveyorStatus FAULT, ERROR frame naming device + fault code. All buttons disabled in FAULT.

Spec + binding decision log: support_files/specs/unit9/ (overview.md, implementation_wireframe.md). ADR 0006. Branch: feat/conveyor-devices.

## Acceptance criteria

- [ ] Pytest: injected faults via virtual_plc produce FAULT + ERROR frame
- [ ] vitest: gating in FAULT
- [ ] verify: GREEN

## Blocked by

- hand-sim-m1za (19)
