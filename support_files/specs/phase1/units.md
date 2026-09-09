# Phase 1: Sub-Phase Units (Vertical Walking Skeletons)

Each unit represents a complete, test-verified end-to-end slice traversing all three architectural tiers: Preact Frontend, Rust Actix-Web Gateway, and Python/ROS2 Jazzy EdgeNode over Zenoh.

---

## Unit 1: The Ping-Pong Walking Skeleton (End-to-End Tracer Bullet)

* **Objective**: Prove the complete distributed loop and wire contracts across all three layers.
* **Frontend (Preact + TypeScript)**:
  * Connects to Gateway WebSocket at `/ws/teleop?robot_id=robot-0`.
  * Renders a "Ping" button and an event log list.
  * Clicking "Ping" dispatches `RobotCommand` (`{"type": "PING", "command_id": "<uuid>", "sender_id": "ui-client", "timestamp_ns": <ns>, "payload": {}}`).
  * Incoming `RobotTelemetryEvent` frames append directly to the UI event log.
* **Gateway (Rust / Actix-Web)**:
  * Enforces single active session per robot on HTTP upgrade (`409 Conflict` on duplicate).
  * Validates incoming WebSocket frames as `RobotCommand`.
  * Publishes valid commands to Zenoh key expression `robot/0/command`.
  * Subscribes to Zenoh key expression `robot/0/telemetry` and forwards events to the active WebSocket client.
  * Emits structured error frame (`{"type": "ERROR", ...}`) on schema violation without dropping connection.
* **EdgeNode (Python / ROS2 Jazzy)**:
  * Subscribes to Zenoh key expression `robot/0/command`.
  * On command receipt, logs message via `rclpy.node.Node` logger (`node.get_logger().info()`).
  * Emits `RobotTelemetryEvent` with `robot_state="IDLE"`, UR5e 6-DoF zero angles, and command confirmation to `robot/0/telemetry`.
* **Definition of Done (TDD Verification)**:
  * Web: Vitest asserts button click sends `PING` frame and incoming event updates DOM.
  * Rust: `cargo nextest` asserts WebSocket command forwarding to Zenoh port and telemetry broadcast.
  * Python: `pytest` asserts Zenoh subscriber callback calls ROS2 logger and publishes valid telemetry event.
  * Integration: Running all three services; clicking "Ping" in browser logs in ROS2 terminal and displays event in Preact UI.

---

## Unit 2: Continuous 6-DoF UR5e Telemetry Stream

* **Objective**: High-frequency telemetry streaming of the 6-DoF UR5e kinematic chain.
* **EdgeNode**: Periodically streams typed `RobotTelemetryEvent` containing `ArmJointPositions` (6 floats in radians) and inference metrics over `robot/0/telemetry`.
* **Gateway**: Stream multiplexing over WebSocket to active session.
* **Frontend**: Decoupled ingestion loop storing joint positions in a non-reactive ref buffer to prevent UI re-render lag.
* **Definition of Done**: Automated tests verify serialization, rate limiting, and non-reactive buffer updates at target frequency without memory leaks.

---

## Unit 3: 3D Visualization & Gazebo Harmonic Sync

* **Objective**: Ingest live physics simulation joint states into Three.js WebGL scene.
* **Gazebo / ROS2**: Gazebo Harmonic publishes UR5e `/joint_states`. EdgeNode ingests and forwards to `robot/0/telemetry`.
* **Frontend**: Three.js scene loads UR5e model using `urdf-loader`. Synchronizes link poses at 60 FPS using REP-103 ↔ WebGL frame mapping (`robotGroup.rotation.x = -Math.PI / 2`).
* **Definition of Done**: Simulation smoke test verifies UR5e visualizer accurately mirrors Gazebo joint motions in real time.

---

## Unit 4: Bidirectional Teleoperation & State Machine

* **Objective**: Full closed-loop joint teleoperation and lifecycle state management.
* **Frontend**: Visualizer controls (joint sliders, emergency stop, trajectory trigger).
* **EdgeNode**: State machine validation (`BOOTING`, `IDLE`, `PROCESSING`, `EXECUTING`, `FAULT`). Dispatches joint trajectory commands to ROS2 controllers.
* **Gateway**: Command validation and safety gating.
* **Definition of Done**: End-to-end integration test asserting state transitions and trajectory execution from UI to Gazebo.

