---
# hand-sim-kkwu
title: 'Unit 9.04: Conveyor device in SIM (eye stop, encoder, exit counter)'
status: todo
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-10-04T13:30:39Z
updated_at: 2026-10-04T13:36:34Z
parent: hand-sim-rqpy
blocked_by:
    - hand-sim-280q
---

## What to build

virtual_plc Conveyor block: belt motion with drive-style ramps, 32-bit encoder, PickZone eye stop as controller-local logic, latched exit-eye counter, HELD_BIN_AWAY refusal when the SCRAP station is not HOME. Conveyor device node: run-to-PickZone / flush / stop action + service, 5 Hz status poll, stop reason reported.

Spec + binding decision log: support_files/specs/unit9/ (overview.md, implementation_wireframe.md). ADR 0006. Branch: feat/conveyor-devices.

## Acceptance criteria

- [ ] Belt stops at the eye by controller logic, not by a ROS poll
- [ ] Exit counts are never lost across slow polls (latched + sequence)
- [ ] Belt refuses RUN/FLUSH while SCRAP not HOME
- [ ] verify: GREEN

## Blocked by

- hand-sim-280q (03)
