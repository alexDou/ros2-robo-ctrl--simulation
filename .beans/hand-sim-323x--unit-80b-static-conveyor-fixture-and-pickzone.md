---
# hand-sim-323x
title: 'Unit 8.0b: Static Conveyor fixture and PickZone'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-28T16:06:03Z
updated_at: 2026-09-29T13:03:17Z
parent: hand-sim-d04j
blocked_by:
    - hand-sim-m9ps
---

## Parent

hand-sim-d04j (Unit 8 spec)

## What to build

Render the Conveyor in front of the arm (X 0.25–0.55, along Y ≈ +0.95 → −0.66, top Z = 0) and define the PickZone (Y −0.51…+0.51) and BeltCapacity (≈ 10) as shared constants. Belt is static in this ticket.

## Acceptance criteria

- [ ] Conveyor fixture rendered where the table used to be, long axis along Y
- [ ] PickZone and BeltCapacity available as shared constants to TeleopClient and tests
- [ ] IK test: all four PickZone corners solve at pick and approach heights; PickZone shrunk until green
- [ ] Arm dimensions unchanged
- [ ] `scripts/verify.sh` prints `verify: GREEN`

## Blocked by

- hand-sim-m9ps (01)

Spec + decision log: `docs_src/specs/unit8/`.

Added BELT_X_RANGE/BELT_Y_RANGE/PICK_ZONE_Y_RANGE/BELT_CAPACITY schema consts, static Conveyor fixture, PickZone corner IK test. Deferred: ScrapBin still at old position (belt-exit relocation is a later Unit 8 ticket), so it overlaps the belt visually until then.
