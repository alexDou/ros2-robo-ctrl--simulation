# Project Architecture Units (Vertical Walking Skeletons)

Each unit represents a complete, test-verified end-to-end slice traversing all three architectural tiers: Preact Frontend, Rust Actix-Web Gateway, and Python/ROS2 Jazzy EdgeNode over Zenoh.

## Specification & Ticket Breakdown Protocol: Contract-First Staging

All unit specifications, task matrices, and ticket breakdowns adhere to a strict 3-stage lifecycle:

1. **Stage 0: Domains, Interfaces & Schemas First (`Unit X.0`)**:
   - Single source of truth: lock wire schemas (`schemas/`), domain types, coordinate conventions, and canonical constants.
   - Run `scripts/generate_domain.py` to regenerate bindings across Python (`src/domain/domain.py`), Rust (`src/domain/domain.rs`), and TypeScript (`web/domain/contracts.ts`).
   - Write cross-language contract tests. All three languages must pass serialization tests before any node implementation starts.
2. **Stage 1..N: Subsystem Modules in Isolation (`Unit X.1`, `X.2`, `X.3`, ...)**:
   - Develop each tier (`EdgeNode`, `Gateway`, `TeleopClient`, asset loaders/simulators) against its mock port boundaries.
   - Modules are developed and tested in complete isolation without dependencies on other running services.
   - Verified hermetically with offline unit/component tests (`pytest`, `cargo nextest`, `vitest`).
3. **Stage Final: Connect Everything Together (`Unit X.N`)**:
   - Multi-service automated integration test suite (Playwright / Cucumber E2E).
   - Concurrently orchestrates real processes (`EdgeNode`, `Gateway`, `TeleopClient`).
   - Verifies live wire communication, state synchronization, and real-time timing / latency budgets (<50ms).

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

## Unit 3: 3D Visualization & Dynamic Kinematic Sync

* **Objective**: Ingest live dynamic 6-DoF joint motion into Three.js WebGL scene in TeleopClient at 60 FPS with REP-103 alignment, zero VDOM diffing overhead, and sub-50ms latency.
* **Architecture**: Contract-first parallel development. Unit 3.0 establishes URDF and mesh asset distribution. Units 3.1 (Dynamic sinusoidal mock publisher), 3.2 (3D WebGL Canvas), and 3.3 (Kinematic sync with dirty-checking) execute against mocked boundaries. Unit 3.4 provides full multi-service E2E verification.

### Sub-Unit Breakdown
- **Unit 3.0: URDF Model Extraction & Static Mesh Asset Distribution**:
  - Resolves UR5e URDF, packages Collada (`.dae`) visual meshes into `web/public/models/ur_description/`, and validates asset resolution via `urdf-loader` package mapping.
- **Unit 3.1: EdgeNode 30 Hz Continuous Sinusoidal Mock Motion Publisher**:
  - Standalone ROS2/EdgeNode executable `mock_motion_publisher.py` emitting smooth 30 Hz multi-axis sinusoidal sweeps across all 6 canonical UR5e joints with zero-order hold.
- **Unit 3.2: TeleopClient Three.js RobotVisualizer Canvas & Scene Infrastructure**:
  - High-performance Three.js viewport in TeleopClient (75% canvas width) with isometric OrbitControls, scene lighting, ground grid, resize observer, and robust WebGL memory disposal lifecycle.
- **Unit 3.3: 60 FPS Telemetry Kinematic Synchronization & REP-103 Frame Alignment**:
  - Zero-VDOM synchronization applying `ArmJointPositions` to `URDFRobot` joints inside animation loop with dirty-checking (rendering only on state/camera changes to prevent browser load), adhering to REP-103 ↔ WebGL frame mapping (`robotGroup.rotation.x = -Math.PI / 2`).
- **Unit 3.4: Dynamic Motion Multi-Service Integration & Latency Verification**:
  - Full-stack multi-service E2E test verifying that 30 Hz dynamic sinusoidal joint motion streamed over DataFabric accurately transforms 3D visualizer meshes in TeleopClient within < 50ms latency alongside 25% sidebar telemetry cards.



---

## Unit 4: Bidirectional Teleoperation & State Machine

* **Objective**: Full closed-loop joint teleoperation and lifecycle state management.
* **Frontend**: Visualizer controls (joint sliders, emergency stop, trajectory trigger).
* **EdgeNode**: State machine validation (`BOOTING`, `IDLE`, `PROCESSING`, `EXECUTING`, `FAULT`). Dispatches joint trajectory commands to ROS2 controllers.
* **Gateway**: Command validation and safety gating.
* **Definition of Done**: End-to-end integration test asserting state transitions and trajectory execution from UI to Gazebo.

