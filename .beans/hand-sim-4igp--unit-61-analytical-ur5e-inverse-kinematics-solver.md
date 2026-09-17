---
# hand-sim-4igp
title: 'Unit 6.1: Analytical UR5e Inverse Kinematics Solver & Waypoint Planner'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-16T17:26:52Z
updated_at: 2026-09-17T09:49:00Z
parent: hand-sim-d20p
---

## Parent
hand-sim-d20p

## What to build
Implement closed-form analytical UR5e inverse kinematics solver in pure Python per ADR 0003. Constrain tool orientation to vertical downward normal with 0.108m Tool Center Point (TCP) offset. Implement deterministic minimal Euclidean joint angular displacement solution selection in [-pi, pi]. Compute 10-step Cartesian waypoint sequence for pick-and-place trajectories.

## Acceptance criteria
- [x] Analytical UR5e IK solver module implemented in pure Python with DH parameters and vertical normal constraint
- [x] Suction cup Tool Center Point (TCP) offset (0.108m) applied accurately to tool flange
- [x] Solution selector chooses minimal Euclidean angular displacement configuration avoiding multi-revolution flips
- [x] Out-of-reach coordinates (R < 0.20m or R > 0.85m) rejected with domain exception
- [x] 10-step Cartesian waypoint trajectory generator implemented for pick, approach, lift, drop, retreat, and home
- [x] Offline unit tests in pytest verify <1mm Cartesian accuracy against forward kinematics

## Summary of Changes

- Implemented closed-form analytical UR5e inverse kinematics solver in `src/edge_node/kinematics.py` using canonical Denavit-Hartenberg parameters ($d = [0.1625, 0, 0, 0.1333, 0.0997, 0.0996]\text{m}$, $a = [0, -0.425, -0.3922, 0, 0, 0]\text{m}$, $\alpha = [\pi/2, 0, 0, \pi/2, -\pi/2, 0]$) in pure Python without third-party dependencies.
- Implemented vertical downward suction cup normal constraint ($Z$-down normal) with accurate Tool Center Point (TCP) offset ($0.108\text{m}$) applied along the tool $Z$-axis to the tool flange.
- Implemented deterministic minimal Euclidean angular displacement branch selection in $[-\pi, \pi]$ avoiding multi-revolution wrapping flips.
- Implemented reachability boundary verification rejecting unreachable targets ($R < 0.20\text{m}$ or $R > 0.85\text{m}$) with domain exception `OutOfReachError`.
- Implemented deterministic 10-step Cartesian and joint waypoint trajectory generator `PickAndPlaceTrajectoryGenerator` for `approach_pick`, `pick`, `grasp`, `lift`, `tower_approach`, `tower_drop`, `release`, `tower_retreat`, `home`, and `complete`.
- Added unit tests in `tests/test_kinematics.py` verifying forward kinematics, TCP offset, reachability boundaries, <1mm Cartesian accuracy against FK across 100 random poses, and 10-step trajectory generation.
- All test suites pass: Python pytest (59/59), Rust cargo test (21/21), and Web vitest (136/136).
