---
# hand-sim-366j
title: 'Unit 5.1: 3D Workcell Table, Raycaster & Procedural Gear Ingestion'
status: todo
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-15T22:29:10Z
updated_at: 2026-09-15T22:29:12Z
parent: hand-sim-7w33
blocked_by:
    - hand-sim-tuyu
---

## Parent
hand-sim-7w33

## What to build
Interactive 3D table workcell mounted in RobotVisualizer with pointer raycasting, reachability boundary validation, dynamic ring reticle visual feedback, procedural gearwheel mesh instantiation, and client-side click lockout.

## Acceptance criteria
- [ ] WorkcellTable slab (0.8m x 0.6m) mounted at Z = 0.0m in front of manipulator with open flanks
- [ ] Pointer raycaster calculates Cartesian coordinates on table surface
- [ ] Dynamic ring reticle projector visible in light accent shade within reachability boundary (0.35m <= R <= 0.75m) and hidden outside or when locked out
- [ ] Clicking reachable table spot renders procedural gearwheel mesh resting at clicked coordinates
- [ ] Client-side ClickLockout prevents further clicks while gearwheel is present
- [ ] TeleopClient component tests pass verifying table rendering, reticle visibility, and lockout transitions

## Blocked by
- hand-sim-tuyu (Unit 5.0)
