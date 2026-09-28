---
# hand-sim-try7
title: 'Unit 8.3b: Full reset on EmergencyStop, FAULT, reload and reconnect'
status: todo
type: task
tags:
    - ready-for-agent
created_at: 2026-09-28T16:06:04Z
updated_at: 2026-09-28T16:06:04Z
parent: hand-sim-d04j
blocked_by:
    - hand-sim-as72
---

## Parent

hand-sim-d04j (Unit 8 spec)

## What to build

On FAULT (incl. after EmergencyStop) and on every TeleopClient connect, the controller empties hopper, belt and Batch and sends CLEAR_WORKSPACE; towers and bin return to empty.

## Acceptance criteria

- [ ] Vitest: FAULT and connect trigger local reset + CLEAR_WORKSPACE
- [ ] pytest: CLEAR_WORKSPACE empties gears, towers and bin
- [ ] E2E: EmergencyStop mid-run → everything empty; page reload → everything empty
- [ ] `scripts/verify.sh` prints `verify: GREEN`

## Blocked by

- hand-sim-as72 (08)

Spec + decision log: `support_files/specs/unit8/`.
