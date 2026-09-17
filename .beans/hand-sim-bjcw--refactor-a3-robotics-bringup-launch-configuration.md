---
# hand-sim-bjcw
title: 'Refactor-A.3: Robotics Bringup Launch Configuration & Controller Manager'
status: todo
type: task
tags:
    - ready-for-agent
created_at: 2026-09-17T12:32:35Z
updated_at: 2026-09-17T12:32:35Z
parent: hand-sim-wt44
blocked_by:
    - hand-sim-6bdr
    - hand-sim-z7uz
---

## Parent

hand-sim-wt44

## What to build

Standard ROS2 launch package robot_bringup with launch file robot_nodes.launch.py orchestrating controller_manager (ros2_control with use_fake_hardware switch), joint_state_broadcaster (500 Hz), scaled_joint_trajectory_controller, workcell_node, and arm_controller_node.

## Acceptance criteria

- [ ] ROS2 package robot_bringup provides robot_nodes.launch.py with use_fake_hardware argument (default: true)
- [ ] controller_manager launches with GenericSystem fake hardware mock for development/CI or physical UR driver for production
- [ ] Spawners activate joint_state_broadcaster (streaming /joint_states at 500 Hz) and scaled_joint_trajectory_controller
- [ ] workcell_node and arm_controller_node launched within same ROS2 ecosystem
- [ ] Launch test verifies all nodes spin up without crashes and /joint_states publishes at 500 Hz

## Blocked by

- hand-sim-6bdr (Refactor-A.1)
- hand-sim-z7uz (Refactor-A.2)
