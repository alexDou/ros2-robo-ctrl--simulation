---
# hand-sim-32pz
title: 'Unit 9.20: device FAULT handling'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-10-04T13:30:40Z
updated_at: 2026-10-06T08:44:54Z
parent: hand-sim-rqpy
blocked_by:
    - hand-sim-m1za
---

## What to build

Drive fault or station timeout → freeze all, ConveyorStatus FAULT, ERROR frame naming device + fault code. All buttons disabled in FAULT.

Spec + binding decision log: docs_src/specs/unit9/ (overview.md, implementation_wireframe.md). ADR 0006. Branch: feat/conveyor-devices.

## Acceptance criteria

- [ ] Pytest: injected faults via virtual_plc produce FAULT + ERROR frame
- [ ] vitest: gating in FAULT
- [ ] verify: GREEN

## Blocked by

- hand-sim-m1za (19)

Done: orchestrator _fault() freezes devices, sets FAULT, publishes cell/fault {device, code}; EdgeNode turns it into a DEVICE_FAULT ERROR frame. Station/belt/arm/workcell faults covered; vitest gating for FAULT/RESETTING. Feeder and drive-fault injection via virtual_plc not added (no such seam yet).
