---
# hand-sim-he7j
title: 'Unit 6.6.3: Grasp attach plus tower growth'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-20T10:44:23Z
updated_at: 2026-09-21T13:17:09Z
parent: hand-sim-4814
blocked_by:
    - hand-sim-3q1f
---

## Parent

hand-sim-4814

## What to build

Gear parents to flange on GRASPING (telemetry or action phase double-check), releases on RELEASING to SpindleTower at z_k=k*0.02m, stack grows across cycles, lockout lifts at HOME plus IDLE.

## Acceptance criteria

- [ ] GRASPING: gear attached/hidden as sucked
- [ ] RELEASING: tower plus one at correct slot height
- [ ] second cycle: tower count 2, lockout lifted between cycles

## Blocked by

- hand-sim-3q1f (Unit 6.6.2)
