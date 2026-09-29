---
# hand-sim-n5lx
title: 'Unit 8.2a: FeedHopper and Fill'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-28T16:06:03Z
updated_at: 2026-09-29T17:59:51Z
parent: hand-sim-d04j
blocked_by:
    - hand-sim-rmju
---

## Parent

hand-sim-d04j (Unit 8 spec)

## What to build

FeedHopper fixture at the belt's upstream end (Y ≈ +0.85). Fill generates the seedable deck of 100 gears — exactly 10 defective (random color) + 30/30/30 intact, shuffled — and the hopper visibly fills. ConveyorStatus EMPTY → LOADED; Process enabled only when LOADED, Fill only when EMPTY.

## Acceptance criteria

- [ ] Vitest: deck has exactly 10 defective and 30/30/30 intact; same seed → same order
- [ ] Hopper fill level reflects deck count
- [ ] Button gating per ConveyorStatus
- [ ] E2E: Fill shows a full hopper and enables Process
- [ ] `scripts/verify.sh` prints `verify: GREEN`

## Blocked by

- hand-sim-rmju (04)

Spec + decision log: `support_files/specs/unit8/`.

Implemented: seedable buildDeck, ConveyorStatus gating (Fill/Process), FeedHopper asset with fill level, E2E. verify GREEN. Deferred to 8.3: deck consumption, HALTED/STOPPED transitions, CLEAR_WORKSPACE on reset.
