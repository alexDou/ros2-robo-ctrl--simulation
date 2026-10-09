---
# hand-sim-ocmq
title: 'Unit 8.1b: SpindleTower auto-empties at 10 with fade'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-28T16:06:04Z
updated_at: 2026-09-29T14:04:03Z
parent: hand-sim-d04j
blocked_by:
    - hand-sim-rmju
---

## Parent

hand-sim-d04j (Unit 8 spec)

## What to build

The commit that brings a tower to TOWER_CAPACITY (10) empties it (count → 0), replacing per-tower FIFO eviction; sibling towers unaffected. TeleopClient fades the stack out over ~1.5 s; the arm does not wait. Counters show n/10.

## Acceptance criteria

- [ ] pytest: 10th commit empties that tower only; no FIFO eviction remains
- [ ] Vitest: count reset triggers ~1.5 s fade; counters n/10
- [ ] E2E: 10th gear on a tower → stack fades, counter 0
- [ ] `scripts/verify.sh` prints `verify: GREEN`

## Blocked by

- hand-sim-rmju (04)

Spec + decision log: `docs_src/specs/unit8/`.

Done: 10th commit empties tower (workcell + mock), TeleopClient fade 1.5 s, n/10 counters overlay, E2E scenario. verify GREEN.
