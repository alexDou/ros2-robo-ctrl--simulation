---
# hand-sim-o5es
title: 'Unit 6.5-Bugfix.2.1: ROS2 EdgeBridge Node - Core Telemetry, Startup Homing & Canned Poses'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-18T15:00:06Z
updated_at: 2026-09-18T15:28:30Z
parent: hand-sim-s0tn
blocked_by:
    - hand-sim-8izv
---

Implement EdgeBridgeNode in src/ros2/arm_controller/arm_controller/edge_bridge_node.py. Run rclpy MultiThreadedExecutor alongside Zenoh session subscriber on robot/{id}/command. Subscribe to /joint_states and connect to ROS2 ActionClient /scaled_joint_trajectory_controller/follow_joint_trajectory. Auto-command HOME pose on controller startup. Dispatch TRAJECTORY_EXECUTE for CANONICAL_POSES (HOME, READY, INSPECT_POSE). Implement EMERGENCY_STOP and RESET_FAULT handling. Register in setup.py and robot_nodes.launch.py. Add unit tests in src/ros2/arm_controller/test/test_edge_bridge_poses.py.

## Summary of Changes

- Implemented `EdgeBridgeNode` in `src/ros2/arm_controller/arm_controller/edge_bridge_node.py` with multi-threaded execution, Zenoh subscriber on `robot/{id}/command`, and Zenoh publisher on `robot/{id}/telemetry`.
- Added zero-alloc cached canonical joint mapping (`CANONICAL_UR5E_JOINTS`) from 500 Hz `/joint_states`.
- Connected `ActionClient` for `/scaled_joint_trajectory_controller/follow_joint_trajectory` with velocity-aware trajectory duration computation.
- Implemented automatic startup homing to `CANONICAL_POSES[HOME]` on controller availability.
- Implemented `TRAJECTORY_EXECUTE` dispatcher for canonical poses (`HOME`, `READY`, `INSPECT_POSE`) with lifecycle state transitions (`IDLE` -> `EXECUTING` -> `IDLE`).
- Implemented `EMERGENCY_STOP` with immediate active goal cancellation, safe-stop deceleration holding current position, and transition to `RobotState.FAULT` (rejecting subsequent motion).
- Implemented `RESET_FAULT` restoring robot state from `FAULT` to `IDLE`.
- Registered `edge_bridge_node` entrypoint in `src/ros2/arm_controller/setup.py` and node lifecycle in `src/ros2/robot_bringup/launch/robot_nodes.launch.py`.
- Added hermetic unit test suite in `src/ros2/arm_controller/test/test_edge_bridge_poses.py` (symlinked in `tests/`) covering homing, poses, emergency stop/reset fault, Zenoh pub/sub, and schema error handling.

