---
# hand-sim-0ceq
title: 'Unit 9.22: reset on connect and RESETTING in TeleopClient'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-10-04T13:30:40Z
updated_at: 2026-10-06T09:11:43Z
parent: hand-sim-rqpy
blocked_by:
    - hand-sim-4f07
    - hand-sim-hvy5
    - hand-sim-145j
---

## What to build

TeleopClient sends CLEAR_WORKSPACE on every connect (so reload = full system reset); RESETTING disables all buttons and the panel shows counts draining to 0.

Spec + binding decision log: support_files/specs/unit9/ (overview.md, implementation_wireframe.md). ADR 0006. Branch: feat/conveyor-devices.

## Acceptance criteria

- [ ] vitest: CLEAR_WORKSPACE sent on each connect
- [ ] Buttons disabled in RESETTING, Fill enabled at EMPTY
- [ ] verify: GREEN

## Blocked by

- hand-sim-4f07 (13)
- hand-sim-hvy5 (18)
- hand-sim-145j (21)

CLEAR_WORKSPACE on every connect was already sent and tested. Added: pose and Clear buttons disabled in RESETTING/FAULT; removed the web auto-CLEAR_WORKSPACE on entering FAULT, which would now trigger cell/reset and release the freeze (recovery is RESET_FAULT only).
