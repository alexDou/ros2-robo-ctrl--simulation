---
# hand-sim-bjcw
title: 'Refactor-A.3: Robotics Bringup Launch Configuration & Controller Manager'
status: completed
type: task
tags:
    - ready-for-agent
created_at: 2026-09-17T12:32:35Z
updated_at: 2026-09-17T16:11:35Z
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

- [x] ROS2 package robot_bringup provides robot_nodes.launch.py with use_fake_hardware argument (default: true)
- [x] controller_manager launches with GenericSystem fake hardware mock for development/CI or physical UR driver for production
- [x] Spawners activate joint_state_broadcaster (streaming /joint_states at 500 Hz) and scaled_joint_trajectory_controller
- [x] workcell_node and arm_controller_node launched within same ROS2 ecosystem
- [x] Launch test verifies all nodes spin up without crashes and /joint_states publishes at 500 Hz

## Blocked by

- hand-sim-6bdr (Refactor-A.1)
- hand-sim-z7uz (Refactor-A.2)

## Summary of Changes

- Created standard ROS2 ament_python package `robot_bringup` in `src/ros2/robot_bringup`
- Configured 500 Hz RTDE loop in `config/ur_controllers.yaml` for `controller_manager`, `joint_state_broadcaster`, and `scaled_joint_trajectory_controller`
- Implemented `launch/robot_nodes.launch.py` with `use_fake_hardware` switch (default: true):
  - In simulated mode (`use_fake_hardware:=true`): dynamically invokes xacro to generate `robot_description` with `mock_components/GenericSystem` mock hardware, starts `robot_state_publisher` and `controller_manager` (`ros2_control_node`), and spawns `joint_state_broadcaster` and `scaled_joint_trajectory_controller`
  - In production mode (`use_fake_hardware:=false`): includes upstream `ur_robot_driver` launch file for RTDE communication with physical robot
  - Orchestrates standalone `workcell_node` and `arm_controller_node` within unified ROS2 graph
- Implemented comprehensive launch integration test in `test/test_robot_nodes_launch.py` verifying:
  - All nodes spin up without crashes (`controller_manager`, `robot_state_publisher`, `workcell_node`, `arm_controller_node`)
  - Spawners configure and activate `joint_state_broadcaster` and `scaled_joint_trajectory_controller`
  - Lifecycle services (`/workcell/get_drop_slot`, `/workcell/clear_workspace`) and action server (`/arm_controller/pick_and_place`) become active
  - High-frequency `/joint_states` telemetry stream operates at 500 Hz nominal (~2ms RTDE period, >400 Hz verified)
- Verified cleanly via `colcon build`, `colcon test`, `pytest`, `flake8`, `cargo test`, and `web` tests
