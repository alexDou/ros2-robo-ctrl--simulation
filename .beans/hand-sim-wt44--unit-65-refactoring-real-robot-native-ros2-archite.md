---
# hand-sim-wt44
title: 'Unit Refactoring-A: Production ROS2 Native Architecture & Real-Hardware Refactoring'
status: completed
type: epic
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-17T11:20:51Z
updated_at: 2026-09-19T19:41:26Z
---

Migrate simulation prototype to production real-arm ROS2 native architecture per ADR 0004. Upstream C++ ros2_control + ur_robot_driver (500 Hz RTDE), Python rclpy standalone workcell_node and arm_controller_node (PickAndPlace.action), zenoh-bridge-ros2dds, and Rust Gateway 500Hz-to-30Hz telemetry throttler with ActiveSession leasing.

## Closure 2026-09-19: all 14 children completed (A.0-A.7 + B.1-B.6 incl h7tu 5Hz fix + 1j8b re-prove). Evidence: cargo test ok, pytest domain 15 ok, web 170 ok lint 0 typecheck ok, launch_test 3 OK stamp 5.00Hz, overruns 82-><=1 bounded. Commit on main.
