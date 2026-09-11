# Project Architecture Units (Vertical Walking Skeletons)

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

* **Objective**: High-frequency, low-latency 30 Hz telemetry streaming of the 6-DoF UR5e kinematic chain from ROS2 to TeleopClient without browser lag.
* **Architecture**: Contract-first parallel development. Unit 2.0 locks down schemas and generated cross-language types. Units 2.1 (EdgeNode), 2.2 (Gateway), and 2.3 (TeleopClient) execute concurrently against mocked interface ports. Unit 2.4 provides end-to-end integration verification.

### Sub-Unit Breakdown
- **Unit 2.0: Domain Schemas & Canonical Joint Constants Sync**:
  - Validates `schemas/robot_telemetry_event.schema.json`, introduces canonical UR5e 6-DoF joint name constants, and regenerates domain models across Python, Rust, and TypeScript via `scripts/generate_domain.py`.
- **Unit 2.1: EdgeNode Robust JointState Extraction & Hybrid Mock Publisher**:
  - Ingests `/joint_states`, extracts canonical UR5e 6-DoF joints with zero-order hold, ignores extraneous/gripper joints, and streams 30 Hz `RobotTelemetryEvent` frames over DataFabric. Includes standalone `mock_publisher.py` and offline `pytest` fixtures.
- **Unit 2.2: Gateway High-Throughput 30 Hz Telemetry Multiplexing**:
  - Asynchronously forwards 30 Hz DataFabric telemetry to ActiveSession WebSocket connections with zero frame drops under standard load. Verified with `cargo nextest`.
- **Unit 2.3: TeleopClient TelemetryMonitor Showcase & Direct DOM Ingestion**:
  - Ingests into non-reactive buffer, paints 6 joint values via `requestAnimationFrame` (zero VDOM diffing overhead), displays ~30 Hz counter and latency, and removes "Verify connection" / Ping controls from DOM during streaming. Verified with `vitest`.
- **Unit 2.4: Multi-Service 30 Hz End-to-End Playwright Suite**:
  - Full-stack multi-service E2E integration test asserting live 30 Hz telemetry, latency < 50ms, DOM paint accuracy, and absence of verify connection controls during streaming.


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

