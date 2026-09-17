# 0004. Real-Robot ROS2 Native Architecture and Gateway 500Hz-to-30Hz Throttling

## Status
Accepted

## Context
During Unit 6 development ("Autonomous Pick-and-Place to Common Destination"), we evaluated architectural alignment between our simulation prototype and production deployment on a physical Universal Robots UR5e arm.

We established the following architectural constraints:
1. **Real Hardware Alignment**: The robotics backend must be designed for physical UR5e operation without "mock debt" or throwaway in-process simulation shortcuts.
2. **Language Constraint**: No custom C++ development. Pre-packaged, battle-tested upstream C++ drivers and libraries (`ur_robot_driver`, `ros2_control`) are permitted, but all custom development must be strictly in Python (`rclpy`) and Rust.
3. **Hardware Real-Time vs Browser Rendering**: Real UR5e e-Series control runs at 500 Hz (2ms RTDE loop) on PREEMPT_RT Linux. The browser visualizer (`TeleopClient`) and human operator require 30–60 Hz (16–33ms).
4. **Boundary Security & Session Exclusivity**: Raw ROS2 DDS cannot be exposed directly to browsers or external networks. A physical 20kg manipulator requires mutual exclusion (`409 Conflict`), schema validation, ingress rate limits, and an immediate hardware-level Emergency Stop.

## Decision

We adopt a three-tier decoupled production architecture:

### 1. Robotics Backend (ROS2 Native)
- **Hardware & Trajectory Execution (Upstream C++)**:
  - Official `ur_robot_driver` + `ros2_control` (`scaled_joint_trajectory_controller`, `joint_state_broadcaster`) communicating with UR controller at 500 Hz over RTDE.
  - Configurable hardware switch: `use_fake_hardware:=true` (`mock_components/GenericSystem`) for fast headless CI and local development; physical robot IP for production.
- **Workcell Inventory (`workcell_node` in Python `rclpy`)**:
  - Promotes `WorkcellState` to a standalone ROS2 node.
  - Exposes services: `GetDropSlot.srv` (calculates next vacant SpindleTower $z_k$), `ClearWorkspace.srv`.
  - Publishes topic: `/workcell/inventory` on change.
- **Autonomous Execution (`arm_controller_node` in Python `rclpy`)**:
  - Action Server for `PickAndPlace.action` (accepts pick/drop targets, streams step feedback, supports clean goal cancellation).
  - Computes closed-form 10-step waypoints in <0.2ms using pure Python analytical IK (`kinematics.py`).
  - Action Client to `scaled_joint_trajectory_controller/follow_joint_trajectory`.

### 2. Protocol Bridge Layer (`zenoh-bridge-ros2dds`)
- Standalone upstream binary daemon mirroring ROS2 DDS topics, services, and actions into Zenoh key expressions.
- Zero custom bridge code; keeps Gateway pure Rust without compiling C++ ROS2 dependencies.

### 3. Edge Gateway (Rust Actix-Web)
- **ActiveSession Leaser**: Enforces single-operator mutual exclusion (`409 Conflict`).
- **Telemetry Throttler**: Ingests 500 Hz `/joint_states` from DDS via Zenoh, downsamples/decimates to 30 Hz using a non-blocking latest-sample sampler, and streams to WebSocket.
- **Command Router & Action Client**: Validates JSON schemas, translates WebSocket commands to ROS2 Actions, and streams Action feedback frames (`phase`, `percent_complete`) back to Web UI.
- **Hardware Emergency Stop**: Bypasses soft application flags to trigger `ur_robot_driver/stop` and controller manager deactivation directly.

### 4. TeleopClient (Web Visualizer)
- Preserves existing role: Preact + Three.js visualizer rendered at 30–60 FPS.
- Adds real-time Action execution feedback progress bar.

## Consequences
- **Zero Mock Debt**: Identical ROS2 node graph runs in simulation and on physical hardware.
- **Full ROS2 Introspection**: Native support for `ros2 node`, `ros2 topic`, `ros2 action`, `ros2 service`, `rqt_graph`, and `rosbag2`.
- **Zero Custom C++**: All custom robotics logic remains in Python (`rclpy`), while Gateway remains in Rust.
- **Safe & Predictable Motion**: Python never runs 500 Hz motor loops; high-frequency motion interpolation is handled deterministically by `ros2_control`.
- **Execution Timing**: Implemented immediately following Unit 6 completion as "Unit 6.5-refactoring".
