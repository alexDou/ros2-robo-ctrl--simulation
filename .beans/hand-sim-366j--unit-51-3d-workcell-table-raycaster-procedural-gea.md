---
# hand-sim-366j
title: 'Unit 5.1: 3D Workcell Table, Raycaster & Procedural Gear Ingestion'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-15T22:29:10Z
updated_at: 2026-09-16T10:52:00Z
parent: hand-sim-7w33
---

## Parent
hand-sim-7w33

## What to build
Interactive 3D table workcell mounted in RobotVisualizer with pointer raycasting, reachability boundary validation, dynamic ring reticle visual feedback, procedural gearwheel mesh instantiation, and client-side click lockout.

## Acceptance criteria
- [x] WorkcellTable slab (0.8m x 0.6m) mounted at Z = 0.0m in front of manipulator with open flanks
- [x] Pointer raycaster calculates Cartesian coordinates on table surface
- [x] Dynamic ring reticle projector visible in light accent shade within reachability boundary (0.35m <= R <= 0.75m) and hidden outside or when locked out
- [x] Clicking reachable table spot renders procedural gearwheel mesh resting at clicked coordinates
- [x] Client-side ClickLockout prevents further clicks while gearwheel is present
- [x] TeleopClient component tests pass verifying table rendering, reticle visibility, and lockout transitions

## Blocked by
- hand-sim-tuyu (Unit 5.0)

## Implementation Summary
- Mounted WorkcellTable slab (0.8m x 0.6m, flush at Z = 0.0m with open flanks) and dynamic ring reticle projector inside `robotGroup` in `web/src/components/RobotVisualizer.tsx`.
- Implemented pointer raycasting on table surface calculating Cartesian coordinates in REP-103 robot base frame and validating reachability boundary ($0.35\text{m} \le R \le 0.75\text{m}$).
- Added procedural Gearwheel mesh (cylinder body, 12 perimeter teeth, center hub; $r = 40\text{mm}, h = 20\text{mm}$) resting at clicked coordinates upon valid table clicks.
- Enforced client-side ClickLockout preventing additional clicks while an active gearwheel is present or manipulator is not IDLE.
- Integrated `SPAWN_OBJECT` command dispatch on table clicks and active gear state tracking in `web/src/components/TeleopClient.tsx`.
- Added comprehensive unit tests in `web/tests/unit/RobotVisualizer.test.tsx` and `web/tests/unit/TeleopClient.test.tsx`.
