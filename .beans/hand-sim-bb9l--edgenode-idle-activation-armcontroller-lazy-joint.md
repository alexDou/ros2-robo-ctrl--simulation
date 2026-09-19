---
# hand-sim-bb9l
title: 'Refactor-B.1: ArmController Lazy Joint Subscription While Parked Idle'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-19T15:00:53Z
updated_at: 2026-09-19T15:55:31Z
parent: hand-sim-wt44
---

## Parent

hand-sim-wt44

## What to build

While controllers sit parked inactive, the ArmController stays silent on joint-state traffic yet still serves the first pick-and-place goal with correct canonical joint mapping. The pick-and-place action endpoint stays always available.

## Acceptance criteria

- [ ] Idle launch yields zero joint-state callbacks in ArmController
- [ ] First pick-and-place goal still maps shuffled joint input to canonical order
- [ ] Existing arm controller tests pass with unmodified semantics
- [ ] Action endpoint stays always on (no timers introduced) and zero-alloc index cache is kept

## Blocked by

None (can start immediately)
