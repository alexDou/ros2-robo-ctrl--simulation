---
# hand-sim-j75k
title: 'Unit 9.23: seeded Cucumber E2E suite (mock gateway)'
status: todo
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-10-04T13:30:40Z
updated_at: 2026-10-04T13:36:35Z
parent: hand-sim-rqpy
blocked_by:
    - hand-sim-0ceq
---

## What to build

Web-only E2E (mock gateway; never proves Gateway/ROS): full Fill → Process run, Stop/resume, EmergencyStop → RESETTING → EMPTY, reload → reset, PalletExchange, BinExchange over two Fills, panel values.

Spec + binding decision log: support_files/specs/unit9/ (overview.md, implementation_wireframe.md). ADR 0006. Branch: feat/conveyor-devices.

## Acceptance criteria

- [ ] All scenarios green with a seeded deck
- [ ] verify: GREEN

## Blocked by

- hand-sim-0ceq (22)
