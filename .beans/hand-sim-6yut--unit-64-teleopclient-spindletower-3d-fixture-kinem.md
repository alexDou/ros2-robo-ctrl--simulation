---
# hand-sim-6yut
title: 'Unit 6.4: TeleopClient SpindleTower 3D Fixture, KinematicLinkAttachment & Tower Stacking'
status: completed
type: task
tags:
    - ready-for-agent
created_at: 2026-09-16T17:27:51Z
updated_at: 2026-09-17T11:51:00Z
parent: hand-sim-d20p
blocked_by:
    - hand-sim-yilh
---

## Parent
hand-sim-d20p

## What to build
Mount procedural SpindleTower fixture in RobotVisualizer at (x=0.40, y=-0.30, z=0.0) on WorkcellTable with metal post (r=0.007m, h=0.20m). Implement deterministic KinematicLinkAttachment parenting gear mesh to tool0 when within 15mm and palm_state.is_grasped == true, and unparenting to tower stack at z_k on release. Implement visual FIFO bottom-drop shift when stacked gear count exceeds 10. Update table click to dispatch PICK_AND_PLACE_TARGET. Update "Clear Workspace" to empty table and tower gears.

## Acceptance criteria
- [x] SpindleTower 3D model mounted at (x=0.40, y=-0.30, z=0.0) with base flange and 0.20m spindle pin
- [x] KinematicLinkAttachment parents gear to tool0 during grasp and unparents to tower stack on release
- [x] Multiple gears stack vertically at z_k = k * 0.02m
- [x] Visual FIFO bottom-drop shift active when tower exceeds 10 gears
- [x] Valid table click dispatches PICK_AND_PLACE_TARGET command and locks further clicks until IDLE
- [x] "Clear Workspace" button clears active table gear and all stacked tower meshes
- [x] Component unit tests pass in vitest

## Blocked by
- hand-sim-yilh (Unit 6.0)
