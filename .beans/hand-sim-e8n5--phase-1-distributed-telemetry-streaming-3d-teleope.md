---
# hand-sim-e8n5
title: 'Phase 1: Distributed Telemetry Streaming & 3D Teleoperation Visualizer'
status: todo
type: feature
tags:
    - ready-for-agent
created_at: 2026-09-09T15:14:02Z
updated_at: 2026-09-09T15:14:02Z
---

## Problem Statement

Robotics developers and remote teleoperators lack a unified, low-latency web interface to observe and command robotic manipulators running in ROS2 simulation environments. Existing solutions like `rosbridge_suite` suffer from high serialization overhead, lack strict schema enforcement, do not prevent competing remote controllers from conflicting on the same physical or simulated hardware, and frequently drop framerates in WebGL renderers due to reactive state re-render thrashing. Furthermore, raw ROS2 DDS types leak directly into browser client code, tightly coupling visualizers to specific robotics middleware distributions.

## Solution

A decoupled three-tier distributed architecture spanning:
1. A lightweight web visualizer providing 60 FPS Three.js rendering of UR5e kinematic links via non-reactive joint position buffering, alongside an event log and teleoperation controls.
2. A high-performance Rust Gateway providing exclusive single-controller sessions per robot instance via RESTful WebSocket endpoints, bidirectional translation between WebSocket JSON frames and Zenoh pub/sub keys, and schema validation with structured error framing.
3. A Python and ROS2 Jazzy EdgeNode ingesting simulated physics joint states from Gazebo Harmonic, validating a finite state machine, and serializing typed domain telemetry over a low-overhead Zenoh DataFabric without leaking DDS structs across the external network boundary.

## User Stories

1. As a remote operator, I want to connect to a specific robot via a RESTful WebSocket URL `/ws/teleop/robot/{id}`, so that I establish a dedicated command and telemetry channel to that targeted manipulator.
2. As a system administrator, I want the Gateway to reject duplicate connection attempts to an already active robot channel with an HTTP 409 Conflict, so that multiple operators cannot issue conflicting commands to the same manipulator.
3. As a remote operator, I want my active connection to be cleanly registered as the sole ActiveSession, so that I have exclusive teleoperation authority.
4. As a remote operator, I want the ActiveSession to be automatically released when I disconnect or close my browser tab, so that other operators or subsequent sessions can connect without manual intervention.
5. As a remote operator, I want to click a "Ping" button in the visualizer interface, so that I can dispatch a heartbeat RobotCommand to verify end-to-end network connectivity.
6. As a remote operator, I want inbound RobotTelemetryEvent frames confirming command execution to append immediately to an event log in the UI, so that I can audit incoming telemetry responses in real time.
7. As a remote operator, I want the visualizer to display connection lifecycle changes (e.g., Connecting, Connected, Disconnected, Reconnecting), so that I know the instantaneous operational status of the network link.
8. As a remote operator, I want the Gateway to validate all inbound WebSocket frames against the RobotCommand schema, so that malformed or malicious payloads are caught at the system boundary before reaching robotics controllers.
9. As a remote operator, I want to receive a structured ERROR frame over the WebSocket when I submit an invalid command, so that I can inspect validation diagnostics without having my session abruptly disconnected.
10. As a software developer, I want the Gateway to route valid RobotCommand payloads to the DataFabric key expression `robot/{id}/command`, so that the EdgeNode receives instructions via deterministic pub/sub channels.
11. As a robotics engineer, I want the EdgeNode to subscribe to `robot/{id}/command` on the DataFabric, so that it receives dispatched commands directly inside the ROS2 execution environment.
12. As a robotics engineer, I want the EdgeNode to log received commands through the native ROS2 logging infrastructure, so that command audits appear within ROS2 terminal diagnostics.
13. As a robotics engineer, I want the EdgeNode to emit a RobotTelemetryEvent confirmation over `robot/{id}/telemetry` upon processing commands, so that upstream consumers know the command was acknowledged.
14. As a remote operator, I want the EdgeNode to stream RobotTelemetryEvent updates containing UR5e ArmJointPositions at high frequency (>= 30 Hz), so that I observe smooth joint movements without perceptible latency.
15. As a frontend developer, I want the web visualizer to ingest streaming ArmJointPositions into a non-reactive reference buffer rather than reactive UI component state, so that high-frequency updates do not trigger unnecessary DOM re-renders or frame stutter.
16. As a remote operator, I want the visualizer to load and render the UR5e 3D manipulator model using standard URDF kinematic specifications, so that I see an accurate visual representation of the robot in my browser.
17. As a robotics engineer, I want the visualizer to translate coordinate frames between ROS2 REP-103 (+X forward, +Y left, +Z up) and WebGL (+X right, +Y up, +Z back) accurately, so that link orientations in the browser match physical and simulation reality without axis inversions.
18. As a simulation engineer, I want Gazebo Harmonic to publish live UR5e `/joint_states`, so that physical simulations generate ground-truth kinematic data for the system.
19. As a robotics engineer, I want the EdgeNode to ingest Gazebo `/joint_states` topics and map them into the standardized ArmJointPositions array, so that simulation-specific message formats never leak into the DataFabric.
20. As a remote operator, I want the 3D visualizer to mirror live Gazebo joint motion at 60 FPS, so that I can monitor simulated arm trajectories visually in real time.
21. As a remote operator, I want UI joint sliders corresponding to each of the 6 UR5e degrees of freedom, so that I can command individual joint angle targets manually.
22. As a remote operator, I want an Emergency Stop button prominently positioned on the visualizer, so that I can immediately abort any active arm movement and hold position during hazardous conditions.
23. As a safety engineer, I want Emergency Stop commands to take highest priority at the Gateway and EdgeNode layers, so that motion halt requests preempt any running motion plans.
24. As a robotics engineer, I want the EdgeNode to manage and enforce a finite RobotState lifecycle (`BOOTING`, `IDLE`, `PROCESSING`, `EXECUTING`, `FAULT`), so that commands are only executed when the manipulator is in an appropriate operational state.
25. As a remote operator, I want the current RobotState displayed clearly on the web visualizer, so that I am always aware of the manipulator's operational readiness.
26. As a remote operator, I want the system to reject motion commands when the RobotState is `FAULT` or `BOOTING`, so that uncalibrated or faulted manipulators cannot execute hazardous trajectories.
27. As a system administrator, I want all three tiers (Web Visualizer, Gateway, EdgeNode) to report health and connectivity metrics, so that system degradation or disconnection in any single tier can be identified and isolated.
28. As a robotics developer, I want the DataFabric communication between Gateway and EdgeNode to use zero-copy, low-overhead serialization, so that network transit overhead across container and network boundaries remains under 5 milliseconds.

## Implementation Decisions

- **Architectural Tiers & Clean Boundaries**:
  - Web Visualizer: Browser-based client responsible solely for UI interaction, Three.js 3D rendering, and non-reactive telemetry buffer management.
  - Gateway: Deep boundary module implemented in Rust using Actix-Web and Actix-Ws. Encapsulates all WebSocket connection management, session exclusivity enforcement, JSON schema validation, and DataFabric pub/sub translation.
  - EdgeNode: Python service combining `rclpy` (ROS2 Jazzy) and Zenoh. Ingests simulation topics, executes lifecycle state machine logic, dispatches ROS2 trajectory commands, and serializes typed domain events.
  - DataFabric: Eclipse Zenoh pub/sub bus establishing RESTful topic keys scoped per robot instance (`robot/{id}/command` and `robot/{id}/telemetry`). No raw DDS types cross this boundary.

- **RESTful WebSocket Route & Session Exclusivity**:
  - The Gateway exposes the WebSocket endpoint at `/ws/teleop/robot/{id}` matching RESTful scoping conventions.
  - The Gateway maintains an in-memory registry of active connections keyed by robot ID.
  - When an HTTP WebSocket upgrade request arrives for a robot ID that already has an ActiveSession, the Gateway terminates the upgrade immediately with `HTTP 409 Conflict`.
  - When the ActiveSession socket disconnects (clean close or TCP teardown), the registry entry is purged immediately.

- **Schema Contracts**:
  - `RobotCommand` format (inbound across WebSocket and `robot/{id}/command`):
    - `command_id`: string (UUID v4)
    - `sender_id`: string
    - `timestamp_ns`: 64-bit integer
    - `type`: string enum (`PING`, `TELEOP_JOINT_TARGET`, `TRAJECTORY_EXECUTE`, `EMERGENCY_STOP`, `RESET_FAULT`)
    - `payload`: key-value object containing command-specific arguments (e.g., target angles, trajectory waypoints)
  - `RobotTelemetryEvent` format (outbound across `robot/{id}/telemetry` and WebSocket):
    - `timestamp_ns`: 64-bit integer
    - `robot_state`: string enum (`BOOTING`, `IDLE`, `PROCESSING`, `EXECUTING`, `FAULT`)
    - `joint_positions`: array of exactly 6 numbers (radians) representing UR5e ArmJointPositions
    - `inference_metrics`: object with `latency_ms` (number), `confidence` (number), `detected_object` (string)
  - Gateway Error Frame:
    - Structured error message `{"type": "ERROR", "error_code": "<CODE>", "message": "<DESCRIPTION>", "timestamp_ns": <ns>}` sent over WebSocket without dropping the connection when schema validation fails.

- **Non-Reactive WebGL Ingestion Loop**:
  - Preact manages the DOM shell, event log list, connection status badge, and user control inputs.
  - Incoming high-frequency `RobotTelemetryEvent` streams update a non-reactive mutable reference buffer (`useRef` / plain memory buffer).
  - The Three.js `requestAnimationFrame` render loop samples the latest values directly from this buffer at 60 FPS, decoupling UI Virtual-DOM reconciliation from the 3D rendering pipeline.

- **Coordinate System Transformation**:
  - Robot kinematics follow ROS2 REP-103 standards (+X forward, +Y left, +Z up).
  - Three.js operates in WebGL conventions (+X right, +Y up, +Z back).
  - Transformation is applied at the root model visualizer group using a 90-degree pitch offset (`rotation.x = -Math.PI / 2`) rather than manually mutating quaternion coordinates per joint.

- **State Machine Architecture**:
  - EdgeNode enforces a deterministic finite state machine for `RobotState`:
    - `BOOTING`: Initializing ROS2 node and DataFabric session. No commands accepted.
    - `IDLE`: Calibrated and stationary. Accepts `PING`, `TELEOP_JOINT_TARGET`, and `TRAJECTORY_EXECUTE`.
    - `PROCESSING`: Validating trajectory or computing kinematic plan.
    - `EXECUTING`: Actively commanding joint movements to ROS2 trajectory controllers.
    - `FAULT`: Safety violation, controller timeout, or error condition. Rejects all motion commands until `RESET_FAULT`.
    - `EMERGENCY_STOP` transitions immediately to `FAULT` (or halted `IDLE`) from any active state.

## Testing Decisions

- **Definition of a Good Test**:
  - Tests verify observable external behavior through public interfaces at defined seams, never private internals or implementation mechanics.
  - Tests survive internal refactoring as long as the contract and behavior remain consistent.
  - Expected test assertions rely on independent ground-truth values and specifications, never tautological recomputations.

- **Modules Under Test & Seams**:
  1. **Gateway Module**:
     - Tested at the Actix-Web service seam (`actix_web::test`) in `cargo nextest`.
     - Tests verify WebSocket handshake at `/ws/teleop/robot/{id}`, HTTP 409 Conflict upon duplicate connection, JSON schema validation, structured error frame emissions on malformed input, and bidirectional forwarding to/from DataFabric pub/sub ports.
  2. **EdgeNode Module**:
     - Tested at the DataFabric subscriber/publisher seam in `pytest`.
     - Tests verify that publishing a `RobotCommand` to `robot/{id}/command` invokes ROS2 logging/controller actions, updates `RobotState`, and emits valid `RobotTelemetryEvent` frames to `robot/{id}/telemetry`.
  3. **Web Visualizer Module**:
     - Tested at the Preact component root seam using Vitest and `@testing-library/preact`.
     - Tests verify that user interactions (clicking "Ping", adjusting joint sliders, pressing Emergency Stop) emit valid `RobotCommand` frames over the WebSocket mock, incoming telemetry appends to the log, and joint positions populate the non-reactive buffer.
  4. **System Integration (End-to-End Seam)**:
     - Tested at the public WebSocket endpoint `/ws/teleop/robot/{id}` across running Gateway, EdgeNode, and ROS2/Gazebo services.
     - Tests verify full tracer-bullet traversal: dispatching `PING` command from a WebSocket client receives an acknowledged `RobotTelemetryEvent` reflected back over the socket with valid telemetry fields.

- **Prior Art**:
  - Gateway WebSocket test suite (`test_ws_handshake_success`, `test_ws_handshake_missing_headers_fails`) in the current Gateway test suite.
  - Vitest component testing setup in the web package.

## Out of Scope

- Multi-robot concurrent fleet visualization (Phase 1 targets a single robot instance `robot-0` per session).
- Edge AI inference model deployment and camera bounding box ingestion (scheduled for Phase 4).
- Dynamic obstacle collision avoidance and complex MoveIt2 pick-and-place trajectories (scheduled for Phase 5).
- WebRTC video stream compression and transport for physical RGB-D camera feeds.
- Persistent database storage or cloud user authentication/authorization (JWT/OAuth) for Gateway access.

## Further Notes

- The RESTful endpoint `/ws/teleop/robot/{id}` replaces the earlier query parameter draft (`/ws/teleop?robot_id={id}`) to adhere strictly to RESTful resource hierarchy conventions.
- Phase 1 implementation follows four sequential vertical walking skeleton units as detailed in the roadmap documentation: Unit 1 (Ping-Pong walking skeleton), Unit 2 (Continuous telemetry streaming), Unit 3 (Three.js WebGL & Gazebo sync), and Unit 4 (Bidirectional teleoperation & state machine).
