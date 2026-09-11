---
# hand-sim-8n0g
title: 'Phase 2: Frame Aggregation & Continuous 6-DoF Telemetry Stream'
status: todo
type: feature
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-11T15:35:04Z
updated_at: 2026-09-11T15:48:59Z
---

## Problem Statement

Remote teleoperators and robotics developers need continuous, real-time observability of robotic manipulator kinematic states without experiencing browser interface stutter or frame dropping, especially on standard or low-end client hardware. Phase 1 proved discrete request-response command execution (Ping-Pong), but the architecture lacks a high-frequency, continuous telemetry pipeline. Furthermore, raw ROS2 `JointState` messages contain non-deterministic ordering and simulation metadata that must not leak across network boundaries, while high-frequency DOM updates in web browsers risk severe Virtual-DOM reconciliation bottlenecks.

## Solution

A high-frequency, low-latency telemetry streaming pipeline that continuously ingests joint states, maps them into domain contracts, transmits them over DataFabric, multiplexes them through Gateway, and displays them in TeleopClient at a browser-optimized 30 Hz:

1. An EdgeNode ingestion pipeline that subscribes to ROS2 `/joint_states`, extracts canonical UR5e 6-DoF joint angles by name with a zero-order hold, gracefully ignores extraneous or future gripper joints, and periodically serializes typed `RobotTelemetryEvent` frames over DataFabric at 30 Hz.
2. A Gateway boundary service that demultiplexes continuous 30 Hz DataFabric telemetry events directly to ActiveSession WebSocket connections using non-blocking asynchronous forwarding with zero frame loss under standard operating conditions.
3. A TeleopClient browser application showcasing a prominent, always-visible `TelemetryMonitor` panel displaying operational `RobotState`, streaming frequency (Hz), packet latency, and 6-DoF joint readouts (radians and degrees). High-frequency joint positions update a non-reactive reference buffer, with numerical values painted directly to DOM text nodes via `requestAnimationFrame` to eliminate Virtual-DOM diffing overhead on low-end devices.
4. Stream-aware connection verification: Because an active telemetry stream inherently proves connection health, TeleopClient completely removes "Verify connection" / Ping controls from the DOM during streaming. "Verify connection" is only rendered in disconnected or idle pre-stream states.
5. A hybrid mock generation architecture providing both a standalone ROS2 publisher script for multi-process DDS integration testing and an offline in-memory test fixture for rapid unit test validation prior to Phase 3 Gazebo physics integration.

## User Stories

1. As a remote operator, I want to see live joint positions streamed continuously to TeleopClient, so that I can observe the manipulator's posture in real time.
2. As a remote operator, I want the telemetry stream to update at a steady 30 Hz, so that joint movements appear fluid without overloading my computer's CPU or network bandwidth.
3. As a remote operator on a low-end laptop, I want TeleopClient to display high-frequency telemetry without frame drops, memory bloat, or browser freezing, so that I can safely monitor operations without interface lag.
4. As a remote operator, I want TeleopClient to prominently showcase the telemetry monitor by default, so that critical robot status and joint angles are immediately visible upon connecting.
5. As a remote operator, I want an active frequency counter displaying the incoming telemetry rate in Hertz, so that I can immediately detect network throttling or pipeline degradation.
6. As a remote operator, I want to see an estimated end-to-end packet latency indicator, so that I know how fresh the displayed telemetry data is.
7. As a remote operator, I want to inspect all 6 canonical UR5e joint angles displayed simultaneously in both radians and degrees, so that I can interpret positions in either engineering unit.
8. As a remote operator, I want the robot operational state displayed as a clear status badge (e.g., IDLE), so that I know the manipulator's readiness level at a glance.
9. As a remote operator, I want "Verify connection" controls to be removed from the DOM while telemetry is actively streaming, so that the screen is free of redundant verification widgets when connection is already proven.
10. As a remote operator, I want "Verify connection" controls visible only when disconnected or before the telemetry stream starts, so that I can verify basic network reachability before streaming begins.
11. As a robotics engineer, I want EdgeNode to subscribe to ROS2 `JointState` messages and extract the 6 canonical UR5e arm joints by name, so that the joint ordering in the ROS2 message does not affect downstream telemetry contracts.
12. As a robotics engineer, I want the joint mapper to ignore extra joints (such as gripper or fixture joints) that appear in the ROS2 message, so that adding new hardware or end-effectors in future phases will not break arm telemetry ingestion.
13. As a robotics engineer, I want the joint mapper to apply a zero-order hold to retain the last known valid angle if an individual joint is omitted in a temporary sensor frame, so that transient sensor drops do not crash the pipeline.
14. As a robotics engineer, I want missing joint angles to default safely to zero radians before initial sensor frames arrive, so that the telemetry pipeline initializes cleanly into a deterministic zero-state.
15. As a robotics engineer, I want non-finite values (such as NaN or Infinity) in incoming joint states to be safely rejected or clamped with a logged warning, so that numerical corruption cannot propagate to DataFabric.
16. As a software developer, I want EdgeNode to emit typed `RobotTelemetryEvent` frames over DataFabric key expression `robot/{id}/telemetry` at a deterministic 30 Hz rate, so that downstream consumers receive predictable, rate-governed data.
17. As a software developer, I want Gateway to forward 30 Hz DataFabric telemetry events asynchronously to ActiveSession, so that TeleopClient receives live updates with sub-millisecond dispatch overhead.
18. As a software developer, I want Gateway to avoid dropping frames under normal operating conditions, so that remote operators receive complete, unbroken telemetry streams.
19. As a software developer, I want Gateway to cleanly release subscriptions and tasks when ActiveSession disconnects, so that telemetry streaming does not leak background resources.
20. As a frontend developer, I want TeleopClient to store incoming joint positions in a non-reactive reference buffer instead of reactive component state, so that 30 Hz frame rates do not trigger continuous Virtual-DOM reconciliations.
21. As a frontend developer, I want numerical telemetry values in TeleopClient to update directly on DOM text nodes inside an animation frame loop, so that the browser's main thread remains completely free for UI interactions.
22. As a frontend developer, I want component-level reactive re-renders to occur only for low-frequency lifecycle changes (such as connecting, disconnecting, and state transitions), so that TeleopClient stays responsive on low-spec hardware.
23. As a test engineer, I want a standalone mock ROS2 publisher node that publishes synthetic zero-state joint messages at 30 Hz over native DDS, so that multi-process integration tests can validate the full pipeline without launching heavy Gazebo physics simulations.
24. As a test engineer, I want an in-memory mock injection interface for EdgeNode, so that unit tests can verify joint mapping and serialization logic deterministically and hermetically in offline pytest runs.
25. As a system administrator, I want all transmitted `RobotTelemetryEvent` payloads to strictly conform to the cross-language JSON schema, so that contract drift between Python, Rust, and TypeScript is prevented.

## Implementation Decisions

- **Telemetry Streaming Rate**:
  - The baseline streaming frequency is standardized at 30 Hz (33.3ms period). This provides an optimal balance between fluid real-time observability and minimal CPU/network overhead on standard and low-end client devices.

- **Hybrid Mock Telemetry Architecture**:
  - Standalone ROS2 Publisher: An independent executable ROS2 node publishing synthetic zero-state `sensor_msgs/msg/JointState` messages at 30 Hz to `/joint_states` over native DDS. Used for multi-process integration testing and live sandbox verification without requiring Gazebo.
  - In-Memory Mock Injection: A lightweight test fixture allowing unit tests to invoke the joint mapping and telemetry emission pipeline directly without spinning external ROS2 middleware or DDS daemons.

- **Named JointState Extraction with Zero-Order Hold**:
  - The joint extraction engine defines the canonical 6-DoF UR5e joint sequence by exact string names: shoulder pan, shoulder lift, elbow, wrist 1, wrist 2, wrist 3.
  - Incoming ROS2 joint states are resolved via named lookup, mapping non-deterministic ROS2 joint arrays into a fixed 6-element floating point array.
  - A zero-order hold state table maintains the latest valid angle per named joint, initialized to 0.0 radians.
  - Extraneous joints (e.g., gripper joints or world joints) are filtered out and ignored, ensuring that future additions of gripper hardware will not break or alter the 6-DoF arm telemetry contract.
  - Non-finite numbers (NaN, Infinity) are rejected with diagnostic error logs.

- **Gateway Asynchronous Stream Multiplexing**:
  - Gateway subscribes to DataFabric telemetry expression `robot/{id}/telemetry` on a dedicated background worker task.
  - Arriving telemetry frames are forwarded non-blockingly to the ActiveSession for that robot identifier.
  - The channel buffer is dimensioned to comfortably handle sustained 30 Hz streaming with zero frame drops under standard conditions, while cleanly dropping queued frames only if a client connection experiences a fatal stall or abrupt disconnect.

- **Zero-VDOM Direct DOM Rendering Strategy in TeleopClient**:
  - TeleopClient maintains incoming `ArmJointPositions` in a mutable non-reactive reference buffer updated directly on WebSocket message arrival.
  - The `TelemetryMonitor` panel binds direct DOM element references to each joint readout.
  - A scheduled `requestAnimationFrame` loop reads the non-reactive buffer and updates the text content of the DOM elements directly, completely bypassing Preact's Virtual-DOM diffing and reconciliation pipeline during active streaming.
  - Reactive component state is reserved exclusively for low-frequency lifecycle transitions (`RobotState` changes, connection status, error alerts) and a throttled 1-second rolling stream frequency counter.

- **UI Layout Hierarchy & Stream-Aware DOM Controls**:
  - The `TelemetryMonitor` panel is positioned prominently as the primary showcase, displaying the operational state badge, 30 Hz frequency indicator, packet latency, and the 6 joint coordinate cards.
  - Stream-Aware Cleanup: When telemetry is actively streaming, "Verify connection" / Ping controls are removed from the DOM completely because active streaming demonstrates connection health. The controls only render in pre-stream or disconnected states.

- **Domain Contracts**:
  - `RobotTelemetryEvent` schema:
    - `timestamp_ns`: 64-bit integer Unix epoch nanoseconds.
    - `robot_state`: String enum (`BOOTING`, `IDLE`, `PROCESSING`, `EXECUTING`, `FAULT`).
    - `joint_positions`: Array of exactly 6 numbers (radians) representing UR5e `ArmJointPositions`.
    - `inference_metrics`: Optional object (null in Phase 2, reserved for Phase 4 ONNX ingestion).
    - `command_id`: Optional string UUID (null for periodic telemetry, populated when acknowledging commands).

## Testing Decisions

- **Definition of a Good Test**:
  - Tests verify observable external behavior and contracts at defined architectural seams, avoiding assertions on private internals or transient mechanical state.
  - Tests survive internal refactoring as long as boundary inputs and outputs remain compliant with domain specifications.
  - Assertions evaluate independent ground-truth values and schema definitions rather than mirroring implementation formulas.

- **Modules Under Test & Seams**:
  1. **EdgeNode Ingestion Seam (Python)**:
     - Tested at the ROS2 `/joint_states` subscriber and DataFabric publisher seam in `pytest`.
     - Tests verify:
       - Extraction of canonical UR5e joints from unordered ROS2 `JointState` arrays.
       - Zero-order hold retention on omitted joints.
       - Discarding of extraneous gripper joints.
       - Rejection or safe handling of NaN/Infinity values.
       - Periodic 30 Hz `RobotTelemetryEvent` emission conforming strictly to the JSON schema.
  2. **Gateway Boundary Seam (Rust)**:
     - Tested at the Actix-Web WebSocket endpoint `/ws/teleop/robot/{id}` and DataFabric mock port in `cargo nextest`.
     - Tests verify:
       - Continuous 30 Hz forwarding of DataFabric telemetry samples to ActiveSession.
       - Zero frame dropping under normal 30 Hz throughput.
       - Graceful teardown of streaming workers when ActiveSession disconnects.
  3. **TeleopClient Component Seam (Preact / TypeScript)**:
     - Tested at the `TelemetryMonitor` component and `useTelemetryStream` hook boundary in `vitest`.
     - Tests verify:
       - Updating the non-reactive reference buffer upon receiving telemetry frames.
       - Lifecycle transition from `DISCONNECTED` to `CONNECTED / IDLE` upon initial frame receipt.
       - Stream frequency counter updates without triggering outer component Virtual-DOM re-renders.
       - DOM removal of "Verify connection" controls once continuous telemetry is streaming.
  4. **Multi-Service System Seam (End-to-End)**:
     - Tested at the browser DOM level using Playwright / Cucumber-Gherkin against the running Gateway, EdgeNode, and mock ROS2 publisher.
     - Tests verify full vertical integration: mock joint state generation -> EdgeNode mapping -> DataFabric transport -> Gateway forwarding -> TeleopClient direct DOM painting, Hz display, and automatic removal of verify connection widgets.

- **Prior Art**:
  - Python EdgeNode test suite in `tests/python/test_node.py`.
  - Rust Gateway WebSocket test harness in `src/gateway/tests/`.
  - Web unit tests in `web/tests/unit/TeleopClient.test.tsx` and Playwright E2E suite in `web/tests/e2e/`.

## Out of Scope

- 3D WebGL mesh loading and kinematic link rendering via Three.js (scheduled for Phase 3).
- Launching and managing headless Gazebo Harmonic physics simulation environments (scheduled for Phase 3).
- End-effector / gripper control and telemetry integration (scheduled for Phase 4/5).
- Camera sensor stream ingestion, bounding box extraction, and ONNX AI inference (scheduled for Phase 4).
- MoveIt2 motion planning, trajectory action clients, and teleoperation joint sliders (scheduled for Phase 4/5).
- Multi-robot fleet connection pooling or multi-tenant user authentication.

## Further Notes

- 30 Hz was explicitly selected during architectural design to guarantee butter-smooth operation on low-end client hardware while maintaining sufficient fidelity for Three.js interpolation in Phase 3.
- Removing "Verify connection" from the DOM during active streaming eliminates interface clutter while preserving pre-stream diagnostic capability.
