---
# hand-sim-fe63
title: 'Unit 8.2b: Belt feeds one Batch and halts at the PickZone edge'
status: todo
type: task
tags:
    - ready-for-agent
created_at: 2026-09-28T16:06:03Z
updated_at: 2026-09-28T16:06:03Z
parent: hand-sim-d04j
blocked_by:
    - hand-sim-n5lx
---

## Parent

hand-sim-d04j (Unit 8 spec)

## What to build

Process runs the belt +Y → −Y; gears drop from the hopper one by one with random delay and random lateral X (min spacing ≈ 0.13 m); Batch size random in 3..BeltCapacity (fewer only if the deck runs out). The belt stops when the Batch lead gear reaches the downstream PickZone edge. ConveyorStatus LOADED → FEEDING → HALTED. No sorting yet.

## Acceptance criteria

- [ ] Vitest (fake clock): batch size bounds, spacing, stop rule, deck decremented
- [ ] All Batch gears are inside the PickZone at halt
- [ ] Belt surface animates while FEEDING and freezes when HALTED
- [ ] E2E: Process feeds a Batch and the belt stops
- [ ] `scripts/verify.sh` prints `verify: GREEN`

## Blocked by

- hand-sim-n5lx (06)

Spec + decision log: `support_files/specs/unit8/`.
