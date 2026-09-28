---
# hand-sim-as72
title: 'Unit 8.2c: Sort one halted Batch gear by gear'
status: todo
type: task
tags:
    - ready-for-agent
created_at: 2026-09-28T16:06:03Z
updated_at: 2026-09-28T16:06:03Z
parent: hand-sim-d04j
blocked_by:
    - hand-sim-fe63
    - hand-sim-zzvr
---

## Parent

hand-sim-d04j (Unit 8 spec)

## What to build

At HALTED the controller processes gears one at a time: SPAWN_OBJECT with the gear's current coordinates + color + intact; sound → PICK_AND_PLACE_TARGET to its tower and wait for IDLE; defective → next gear. Batch done → arm HOME.

## Acceptance criteria

- [ ] Vitest: command sequence per gear, wait-for-IDLE before next, defective skipped
- [ ] Gear picked at its current coordinates (robust to being moved)
- [ ] E2E: a seeded mixed Batch ends with sound gears on their towers and bin red
- [ ] `scripts/verify.sh` prints `verify: GREEN`

## Blocked by

- hand-sim-fe63 (07)
- hand-sim-zzvr (05)

Spec + decision log: `support_files/specs/unit8/`.
