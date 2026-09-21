# Project Architecture Units (Vertical Walking Skeletons)
> [!NOTE] HISTORICAL-SUPERSEDED-BY-6.6.0: `PROCESSING` state refs below are stale. Removed in Unit 6.6.0 (hand-sim-jqtr, e80962b). Contract is BOOTING/STANDBY/IDLE/EXECUTING/FAULT. Kept for history, do not implement.

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

## Unit 4: Dexterous Palm Integration & Actuation Foundation

* **Objective**: Mount Dexterous Palm (pneumatic suction tool) to UR5e flange (`tool0`), establish end-effector domain contracts, implement EdgeNode lifecycle state machine (`BOOTING`, `IDLE`, `PROCESSING`, `EXECUTING`, `FAULT`) with bounded command FIFO queue ($N=5$) and E-Stop purge, Gateway safety gating at 20 Hz, canned trajectory triggers, and palm grasp/release controls in TeleopClient.
* **Architecture**: Contract-first parallel development. Unit 4.0 locks down schemas and generated cross-language types. Units 4.1 (3D Palm mounting), 4.2 (EdgeNode state machine & queue), 4.3 (Gateway safety gating), and 4.4 (TeleopClient operator controls) execute concurrently against mocked interface seams. Unit 4.5 provides full multi-service E2E verification.

### Sub-Unit Breakdown
- **Unit 4.0: Domain Schemas & Palm Actuation Contracts**:
  - Extends `schemas/robot_command.schema.json` with typed payloads for `PALM_ACTUATE` (`{ "action": "GRASP" | "RELEASE" }`), `TRAJECTORY_EXECUTE` (canned names `"HOME"`, `"READY"`, `"INSPECT_POSE"` + waypoint arrays), `EMERGENCY_STOP`, and `RESET_FAULT`.
  - Extends `schemas/robot_telemetry_event.schema.json` with end-effector state (`palm_state: { "is_grasped": boolean }`).
  - Regenerates domain models across Python, Rust, and TypeScript via `scripts/generate_domain.py`.
- **Unit 4.1: Dexterous Palm 3D Model & Kinematic Flange Mounting**:
  - Builds procedural pneumatic suction tool geometry parented directly to UR5e `tool0` flange in Three.js scene (`RobotVisualizer`).
  - Implements visual grasp indicator state (highlight/color shift when `palm_state.is_grasped` changes).
- **Unit 4.2: EdgeNode Lifecycle State Machine & ROS2 Controller Dispatch**:
  - Implements authoritative state machine (`BOOTING`, `IDLE`, `PROCESSING`, `EXECUTING`, `FAULT`).
  - Implements bounded FIFO command queue ($N=5$) for valid commands arriving during `EXECUTING`.
  - Implements full FIFO queue purge and immediate motion abort on `EMERGENCY_STOP`.
  - Dispatches trajectories to ROS2 `joint_trajectory_controller` action server `/joint_trajectory_controller/follow_joint_trajectory` (with lightweight cubic spline interpolation fallback in mock controller).
- **Unit 4.3: Gateway Safety Gating & 20 Hz Command Throttling**:
  - Enforces stateless syntactic validation, 6-DoF joint limits $[-\pi, \pi]$, and 20 Hz command rate throttling per ActiveSession.
  - Emits structured `ErrorFrame` on schema violations or queue limits without dropping WebSocket connection.
- **Unit 4.4: TeleopClient Operator Toolbar & Lifecycle Controls**:
  - Implements sleek horizontal toolbar under Three.js canvas containing Canned Pose triggers (`"Home"`, `"Ready"`, `"Inspect"`), Palm toggle (`"Grasp" / "Release"`), and `"Reset Fault"`.
  - Mounts persistent, high-visibility Emergency Stop button and `RobotState` indicator.
  - Enforces UI interlocks: action controls disabled when `robot_state !== 'IDLE'`.
- **Unit 4.5: Closed-Loop Multi-Service Integration Suite**:
  - Multi-service automated integration test asserting live state transitions (`IDLE` $\to$ `PROCESSING` $\to$ `EXECUTING` $\to$ `IDLE`), canned trajectory execution, palm actuation, and emergency stop halt across TeleopClient, Gateway, and EdgeNode within < 50ms latency budget.

---

## Unit 5: Interactive 3D Workcell & Click-to-Place Gear Ingestion

* **Objective**: Build the interactive 3D table workcell in TeleopClient, implement raycast surface placement of gearwheels adhering to UR5e reachability limits, and enforce single-gear click lockout.
* **Architecture**: Contract-first development. Unit 5.0 locks down `SPAWN_OBJECT` / `TARGET_POSE` wire schemas. Unit 5.1 creates the Three.js table workcell, reachability boundary, and procedural gearwheel mesh. Unit 5.2 provides component verification.

### Sub-Unit Breakdown
- **Unit 5.0: Object Spawning Wire Contract**:
  - Defines `SPAWN_OBJECT` schema in `schemas/robot_command.schema.json` with Cartesian coordinates `(x, y, z)` in native REP-103 robot base frame.
  - Regenerates domain bindings across all three tiers.
- **Unit 5.1: 3D Workcell Table, Raycaster & Reachability Boundary**:
  - Mounts interactive table surface inside `robotGroup` in Three.js (preserving REP-103 coordinates).
  - Implements Three.js raycasting on table click: extracts $(x, y, z)$ in robot base coordinates.
  - Enforces reachability check: $0.35\text{m} \le R \le 0.75\text{m}$. Renders green cursor if reachable, red if out of reach.
  - Spawns visual gearwheel mesh on valid click.
  - Enforces click lockout: once clicked, disables all further clicks until the gear has been processed and cleared.
  - Adds "Clear Workspace" button in UI to remove spawned gear manually if needed.
- **Unit 5.2: TeleopClient Component & Raycast Test Suite**:
  - Vitest component tests asserting raycast coordinate accuracy, reachability boundary clamping, click lockout state, and "Clear Workspace" lifecycle.

---

## Unit 6: Autonomous Pick-and-Place to Common Destination

* **Objective**: Achieve complete closed-loop autonomous pick-and-place: clicking table dispatches target coordinates through Gateway to EdgeNode, which computes analytical IK waypoints, moves UR5e, grasps gear with Kinematic Link Attachment, moves to a common drop stack, releases gear, and returns to IDLE.
* **Architecture**: Contract-first development. Unit 6.0 defines pick-and-place goal schemas. Units 6.1 (EdgeNode analytical IK & trajectory generator), 6.2 (Three.js Kinematic Link Attachment), and 6.3 (End-to-End closed-loop test) execute against defined seams.

### Sub-Unit Breakdown
- **Unit 6.0: Pick-and-Place Target Schemas**:
  - Defines `PICK_AND_PLACE_TARGET` command payload with gear position `(x, y, z)` and common drop stack target.
- **Unit 6.1: EdgeNode Analytical IK & Waypoint Generation**:
  - Implements closed-form analytical UR5e IK solver inside EdgeNode for Cartesian waypoints:
    $P_{\text{approach}} \to P_{\text{pick}} \to P_{\text{lift}} \to P_{\text{drop\_approach}} \to P_{\text{drop}} \to P_{\text{home}}$.
  - Generates smooth joint trajectories with bounded velocity and acceleration, dispatches to ROS2 controller / mock.
  - Drives state machine: transitions `IDLE` $\to$ `PROCESSING` (during IK calculation) $\to$ `EXECUTING` (during arm motion) $\to$ `IDLE` (on return home).
- **Unit 6.2: Three.js Kinematic Link Attachment Seam**:
  - Implements deterministic link attachment in Three.js: when Palm state is `GRASP` and `tool0` is $\le 15\text{mm}$ from gear, gear mesh is parented to `tool0`.
  - When Palm state is `RELEASE`, gear mesh unparents and rests stably at drop stack height $z$.
  - Resets click lockout in TeleopClient upon returning to `IDLE`.
- **Unit 6.3: Closed-Loop Pick-and-Place Integration Suite**:
  - Multi-service automated integration test: click on table $\to$ gear spawns $\to$ EdgeNode plans trajectory $\to$ arm picks gear $\to$ drops onto common stack $\to$ arm returns to IDLE $\to$ click re-enabled.

---

## Unit Refactoring-A: Production ROS2 Native Architecture & Real-Hardware Refactoring

* **Objective**: Refactor simulation prototype backend into production-grade, real-hardware-ready ROS2 native architecture per [ADR 0004](../../docs/adr/0004-real-robot-ros2-native-architecture-and-gateway-throttling.md) and [unit_refactoring-a/overview.md](./unit_refactoring-a/overview.md). Eliminate mock debt with upstream `ros2_control` (500 Hz RTDE loop with fake hardware switch), decompose monolithic `EdgeNode` into standalone ROS2 packages (`workcell_manager` and `arm_controller`), define native ROS2 action and service interfaces in `robot_control_interfaces`, launch `zenoh-bridge-ros2dds` alongside Gateway in `launch_gateway.sh`, implement 500Hz-to-30Hz `TelemetryThrottler` in Rust Gateway, and establish dedicated per-service launch workflows.
* **Architecture**: Contract-first staged development across decoupled ROS2 packages in `src/ros2/` and Rust Gateway.

### Sub-Unit Breakdown
- **Refactor-A.0: ROS2 Interfaces Package**:
  - Defines `PickAndPlace.action`, `GetDropSlot.srv`, and `ClearWorkspace.srv` in `src/ros2/robot_control_interfaces` (`ament_cmake`).
- **Refactor-A.1: Standalone Workcell Node**:
  - Migrates `WorkcellState` into standalone `workcell_node` (`src/ros2/workcell_manager`), exposing services and `/workcell/inventory`.
- **Refactor-A.2: Standalone Arm Controller Action Server**:
  - Implements `arm_controller_node` (`src/ros2/arm_controller`) wrapping analytical IK, action server `PickAndPlace.action`, and trajectory client to `scaled_joint_trajectory_controller`.
- **Refactor-A.3: Robotics Bringup & Launch Configuration**:
  - Implements `robot_nodes.launch.py` in `src/ros2/robot_bringup` orchestrating `ros2_control` (with `use_fake_hardware` switch), `workcell_node`, and `arm_controller_node`.
- **Refactor-A.4: Edge Gateway Throttler, Action Bridge & Launcher**:
  - Integrates `zenoh-bridge-ros2dds` into `scripts/launch_gateway.sh`, implements 500Hz-to-30Hz `TelemetryThrottler` in Rust Gateway, and bridges Action feedback to WebSockets.
- **Refactor-A.5: Mock Gateway E2E Test Harness & UI Suite Migration**:
  - Implements lightweight in-process MockGateway emulating Gateway WebSocket protocol and /health; refactors test harness to run hermetically without spawning backend binaries; creates `scripts/launch_teleop-client.sh`; migrates existing 4 E2E features.
- **Refactor-A.6: Pick-and-Place & SpindleTower Stacking UI E2E Feature**:
  - Gherkin feature and step definitions verifying closed-loop table click -> Action progress feedback -> tool flange grasp attachment -> SpindleTower stacking -> ClickLockout reset against MockGateway.
- **Refactor-A.7: Legacy Prototype Retirement & Full System Verification**:
  - Cleanly removes deprecated `src/edge_node/` prototype and obsolete tests; adjusts non-RT timing tolerance in launch test; harmonizes full test suite across Cargo, Colcon, Pytest, and Web.

---

## Unit 7: Multi-Color Gear Sorting & Defect QC Inspection

* **Objective**: Extend pick-and-place with vision classification and automated sorting: gears spawn with randomized colors (Red, Green, Blue) and 20% defect probability (crack notch); EdgeNode routes good gears to matching color spindle towers and cracked gears to the Scrap Bin.
* **Architecture**: Contract-first development. Unit 7.0 locks down QC inspection schemas and tower counter telemetry. Unit 7.1 models 4 physical destinations in Three.js. Unit 7.2 implements EdgeNode vision classification pipeline. Unit 7.3 implements multi-service sorting integration.

### Sub-Unit Breakdown
- **Unit 7.0: QC Classification & Spindle Telemetry Contracts**:
  - Extends `RobotTelemetryEvent.inference_metrics` (`confidence`, `latency_ms`, `detected_object`) and adds spindle tower counters: `[Red: X/3] [Green: Y/3] [Blue: Z/3] [Scrap: W]`.
- **Unit 7.1: 3D Spindle Towers, Scrap Chute & Defect Mesh**:
  - Adds 3 colored spindle towers (Red, Green, Blue) and Scrap Chute / Bin in Three.js workcell.
  - Implements procedural cracked gear mesh with visible notch for defective items (20% probability).
  - Enforces tower capacity limit: max 3 gears per spindle tower ($N_{\max} = 9$ total).
- **Unit 7.2: EdgeNode Vision Classification & Sorting Trajectory Planner**:
  - Implements lightweight ONNX / rule-based classifier evaluating color and defect flag, outputting typed `inference_metrics`.
  - Routes trajectory destination: defective gears $\to$ Scrap Bin; good gears $\to$ matching color spindle tower.
  - Updates tower counters in periodic 30 Hz telemetry stream.
- **Unit 7.3: Multi-Destination Sorting Multi-Service Suite**:
  - Automated integration test verifying: defective gear routed to scrap, red gear routed to red spindle, green to green spindle, blue to blue spindle, and UI counters increment accurately.

---

## Unit 8: Indexing Conveyor Belt & Dual-Flow Interaction Showcase

* **Objective**: Implement the step-and-wait indexing conveyor belt as a second operational flow, provide mutually exclusive mode switching ("Click-to-Place" vs "Conveyor Belt"), and deliver the complete final interactive showcase from `support_files/iterations/iter-2.txt`.
* **Architecture**: Contract-first development. Unit 8.0 defines conveyor operational mode schemas. Unit 8.1 implements 3D conveyor model and indexing step-and-wait animation. Unit 8.2 implements EdgeNode conveyor feed orchestration. Unit 8.3 integrates dual-flow UI mode toggle and full showcase E2E suite.

### Sub-Unit Breakdown
- **Unit 8.0: Dual-Flow Mode Wire Contract**:
  - Defines `SET_OPERATION_MODE` command (`"CLICK_TO_PLACE"` | `"CONVEYOR_FEED"`).
  - Enforces mutual exclusion: selecting one mode locks the other until the current flow finishes or is stopped.
- **Unit 8.1: 3D Indexing Conveyor & Step-and-Wait Animation**:
  - Models linear conveyor belt entering the workcell from the left flank.
  - Implements deterministic step-and-wait indexing: conveyor advances gear to fixed pickup position and stops.
  - Arm picks up gear from pickup stop $\to$ conveyor waits until arm returns to `IDLE` $\to$ conveyor indexes next gear into pickup position.
  - Conveyor overflow return chute despawns unhandled items gracefully.
- **Unit 8.2: EdgeNode Conveyor Orchestration & Feed Sequencing**:
  - EdgeNode controls conveyor step timer and pickup state coordination.
  - Feeds gears at controlled intervals up to capacity limit $N_{\max} = 9$.
- **Unit 8.3: Showcase Integration & Multi-Service Playwright Suite**:
  - UI mode toggle: "Mode: Click-to-Place" vs "Mode: Conveyor Belt" with busy-state gating.
  - Comprehensive automated E2E test verifying both operational flows, emergency stop interrupts, capacity bounds, and reset workspace actions.

