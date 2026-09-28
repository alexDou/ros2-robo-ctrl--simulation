---
# hand-sim-7ygg
title: 'Unit 8.2d: Continuous run until the hopper is empty, with fall-off and flush'
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

After a Batch the belt restarts automatically; defective leftovers ride off the belt end and fall into the ScrapBin. Batches repeat until the deck is empty, then a final flush clears the belt; ConveyorStatus → EMPTY, Fill enabled, Process disabled.

## Acceptance criteria

- [ ] Vitest: batch cycling, fall-off when a gear passes the belt end, flush, final gating
- [ ] No gears remain on the belt after the flush
- [ ] E2E: seeded full 100-gear run completes
- [ ] `scripts/verify.sh` prints `verify: GREEN`

## Blocked by

- hand-sim-as72 (08)

Spec + decision log: `support_files/specs/unit8/`.
