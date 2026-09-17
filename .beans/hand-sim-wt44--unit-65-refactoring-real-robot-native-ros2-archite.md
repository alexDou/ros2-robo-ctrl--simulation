---
# hand-sim-wt44
title: 'Unit Refactoring-A: Production ROS2 Native Architecture & Real-Hardware Refactoring'
status: todo
type: epic
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-17T11:20:51Z
updated_at: 2026-09-17T12:30:43Z
---

Migrate simulation prototype to production real-arm ROS2 native architecture per ADR 0004. Upstream C++ ros2_control + ur_robot_driver (500 Hz RTDE), Python rclpy standalone workcell_node and arm_controller_node (PickAndPlace.action), zenoh-bridge-ros2dds, and Rust Gateway 500Hz-to-30Hz telemetry throttler with ActiveSession leasing.
