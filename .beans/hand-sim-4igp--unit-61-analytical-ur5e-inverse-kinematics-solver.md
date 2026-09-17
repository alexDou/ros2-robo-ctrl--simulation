---
# hand-sim-4igp
title: 'Unit 6.1: Analytical UR5e Inverse Kinematics Solver & Waypoint Planner'
status: todo
type: task
tags:
    - ready-for-agent
created_at: 2026-09-16T17:26:52Z
updated_at: 2026-09-16T17:26:52Z
parent: hand-sim-d20p
blocked_by:
    - hand-sim-yilh
---

## Parent
hand-sim-d20p

## What to build
Implement closed-form analytical UR5e inverse kinematics solver in pure Python per ADR 0003. Constrain tool orientation to vertical downward normal with 0.108m Tool Center Point (TCP) offset. Implement deterministic minimal Euclidean joint angular displacement solution selection in [-pi, pi]. Compute 10-step Cartesian waypoint sequence for pick-and-place trajectories.

## Acceptance criteria
- [ ] Analytical UR5e IK solver module implemented in pure Python with DH parameters and vertical normal constraint
- [ ] Suction cup Tool Center Point (TCP) offset (0.108m) applied accurately to tool flange
- [ ] Solution selector chooses minimal Euclidean angular displacement configuration avoiding multi-revolution flips
- [ ] Out-of-reach coordinates (R < 0.20m or R > 0.85m) rejected with domain exception
- [ ] 10-step Cartesian waypoint trajectory generator implemented for pick, approach, lift, drop, retreat, and home
- [ ] Offline unit tests in pytest verify <1mm Cartesian accuracy against forward kinematics

## Blocked by
- hand-sim-yilh (Unit 6.0)
