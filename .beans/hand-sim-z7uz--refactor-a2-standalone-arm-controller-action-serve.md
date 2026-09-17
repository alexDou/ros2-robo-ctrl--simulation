---
# hand-sim-z7uz
title: 'Refactor-A.2: Standalone Arm Controller Action Server & Analytical IK Dispatcher'
status: completed
type: task
tags:
    - ready-for-agent
created_at: 2026-09-17T12:32:30Z
updated_at: 2026-09-17T15:51:30Z
parent: hand-sim-wt44
blocked_by:
    - hand-sim-glrj
---

## Parent

hand-sim-wt44

## What to build

Standalone Python ROS2 node arm_controller_node in package arm_controller wrapping closed-form analytical UR5e IK solver. Exposes /arm_controller/pick_and_place action server, plans 10-step waypoint trajectory with downward tool orientation, streams phase feedback, and commands scaled_joint_trajectory_controller.

## Acceptance criteria

- [x] ament_python package arm_controller configured with entrypoint arm_controller_node
- [x] Incorporates AnalyticalInverseKinematics solver (<0.2ms solve time, downward tool orientation, 0.108m TCP offset)
- [x] PickAndPlace.action server ingests pick coordinates and queries /workcell/get_drop_slot when needed
- [x] Generates 10-step Cartesian waypoint sequence and dispatches to FollowJointTrajectory action client
- [x] Emits real-time action feedback phases (APPROACHING through HOMING)
- [x] Supports goal cancellation, aborting trajectory and commanding immediate safe stop
- [x] Unit tests in pytest verify analytical IK integration and action lifecycle against mock controller


## Blocked by

- hand-sim-glrj (Refactor-A.0)
