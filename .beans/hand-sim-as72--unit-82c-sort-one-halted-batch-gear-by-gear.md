---
# hand-sim-as72
title: 'Unit 8.2c: Sort one halted Batch gear by gear'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-28T16:06:03Z
updated_at: 2026-09-29T19:20:50Z
parent: hand-sim-d04j
blocked_by:
    - hand-sim-fe63
    - hand-sim-zzvr
---

## Parent

hand-sim-d04j (Unit 8 spec)

## What to build

At HALTED the controller processes gears one at a time: SPAWN_OBJECT with the gear's current coordinates + color + intact; intact → PICK_AND_PLACE_TARGET to its tower and wait for IDLE; defective → next gear. Batch done → arm HOME.

## Acceptance criteria

- [ ] Vitest: command sequence per gear, wait-for-IDLE before next, defective skipped
- [ ] Gear picked at its current coordinates (robust to being moved)
- [ ] E2E: a seeded mixed Batch ends with intact gears on their towers and bin red
- [ ] `scripts/verify.sh` prints `verify: GREEN`

## Blocked by

- hand-sim-fe63 (07)
- hand-sim-zzvr (05)

Spec + decision log: `support_files/specs/unit8/`.

Implemented processBatch + TeleopClient wiring; E2E @unit-8.2c added (unseeded Batch; seeding is a follow-up).

Follow-up: Process runs the whole deck (runDeck), defective gears stay on the belt and are carried off by the next run + final flush, Process needs full hopper, errors reported+rethrown, conveyor logic extracted to useConveyor/useWorkcellWaiters, E2E seeded (?seed, ?time_scale) and verified against the mock's received-command log.
