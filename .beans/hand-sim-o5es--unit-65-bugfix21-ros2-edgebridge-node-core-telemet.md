---
# hand-sim-o5es
title: 'Unit 6.5-Bugfix.2.1: ROS2 EdgeBridge Node - Core Telemetry, Startup Homing & Canned Poses'
status: todo
type: task
tags:
    - ready-for-agent
created_at: 2026-09-18T15:00:06Z
updated_at: 2026-09-18T15:00:06Z
parent: hand-sim-s0tn
blocked_by:
    - hand-sim-8izv
---

Implement EdgeBridgeNode in src/ros2/arm_controller/arm_controller/edge_bridge_node.py. Run rclpy MultiThreadedExecutor alongside Zenoh session subscriber on robot/{id}/command. Subscribe to /joint_states and connect to ROS2 ActionClient /scaled_joint_trajectory_controller/follow_joint_trajectory. Auto-command HOME pose on controller startup. Dispatch TRAJECTORY_EXECUTE for CANONICAL_POSES (HOME, READY, INSPECT_POSE). Implement EMERGENCY_STOP and RESET_FAULT handling. Register in setup.py and robot_nodes.launch.py. Add unit tests in src/ros2/arm_controller/test/test_edge_bridge_poses.py.
