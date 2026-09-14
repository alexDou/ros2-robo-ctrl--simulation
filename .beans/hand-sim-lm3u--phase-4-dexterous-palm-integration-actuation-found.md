---
# hand-sim-lm3u
title: 'Phase 4: Dexterous Palm Integration & Actuation Foundation'
status: completed
type: feature
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-14T15:13:02Z
updated_at: 2026-09-14T20:27:37Z
---

## Problem Statement

Remote teleoperators and robotics engineers operating the simulated UR5e robotic manipulator cannot interact with objects or execute coordinated physical manipulation workflows because the system lacks an end-effector model, actuation contracts, an authoritative lifecycle state machine, and operator control tooling. 

While earlier phases successfully established 3D arm visualization and continuous 30 Hz joint telemetry streaming, the arm remains an unactuated, open-loop kinematic chain. Teleoperators have no means to command standard operational poses (such as Homing, Ready, or Inspection postures), cannot actuate end-effector grasping or releasing, have no safety mechanism to immediately abort unexpected or hazardous joint movements, and have no visual indication of end-effector grasp states in the 3D scene.

Furthermore, sending arbitrary commands across distributed web interfaces introduces severe operational hazards:
1. Network latency, rapid operator clicks, or automated scripts can flood the communication fabric with high-frequency command packets, overwhelming the underlying real-time controller.
2. If an operator dispatches a new motion command while the manipulator is already executing a multi-second trajectory, unmanaged concurrent command ingestion can corrupt active motion profiles, cause kinematic discontinuities, or crash the control loop.
3. If an emergency stop occurs, the lack of an explicit, authoritative lifecycle state machine prevents the system from deterministically halting motion, isolating faults, and safely recovering without initiating dangerous unintended autonomous movements.

## Solution

A robust, closed-loop end-effector actuation and lifecycle management foundation integrated across all three architectural tiers (`TeleopClient`, `Gateway`, and `EdgeNode` over `DataFabric`):

1. **Dexterous Palm Procedural End-Effector**: A procedural pneumatic suction tool mounted directly to the UR5e kinematic flange (`tool0`) in the `RobotVisualizer` Three.js scene, featuring real-time visual grasp indication (nozzle highlight/glow) synchronized with incoming telemetry via zero-overhead dirty checking on a non-reactive buffer reference.
2. **Contract-First Actuation Domain Schemas**: Formalized wire contracts defining typed payloads for palm actuation (`PALM_ACTUATE`), canned trajectory dispatch (`TRAJECTORY_EXECUTE`), emergency stopping (`EMERGENCY_STOP`), and fault clearance (`RESET_FAULT`), alongside a mandatory `palm_state` field in outbound `RobotTelemetryEvent` frames.
3. **Authoritative EdgeNode Lifecycle & Single-Command Gating**: An explicit 5-state lifecycle state machine (`BOOTING`, `IDLE`, `PROCESSING`, `EXECUTING`, `FAULT`) enforcing strict `SingleCommandGating`. Motion and actuation commands are accepted exclusively when `RobotState` is `IDLE`. Any command arriving during active execution is immediately rejected with a structured error frame and warning log without tripping the system into an unrecoverable fault or relying on complex FIFO command queues.
4. **Deterministic Motion & Pneumatic Simulation**: Canned trajectory generation interpolating smooth 30 Hz cubic Hermite trajectories over a 2.0-second profile across standard UR5e postures (`HOME`, `READY`, `INSPECT_POSE`), coupled with a simulated 200ms pneumatic pressurization delay during suction grasp/release cycles.
5. **Fail-Safe Emergency Stop & Safe Fault Recovery**: Immediate motion abortion and transition to `FAULT` upon receiving `EMERGENCY_STOP`, alongside strict, safe fault clearance via `RESET_FAULT` that transitions the system directly from `FAULT` to `IDLE` at the current physical pose without initiating autonomous arm movement.
6. **Stateless Gateway Safety Gating**: A stateless 20 Hz (50ms minimum interval) rate limiter guarding the `DataFabric` per `ActiveSession`, rejecting transport floods with structured `ErrorFrame` responses while granting `EMERGENCY_STOP` unconditional, zero-latency bypass.
7. **Operator Control Toolbar & Visual Interlocks**: A sleek, intuitive control toolbar docked directly beneath the 3D viewport in `TeleopClient` exposing Canned Pose triggers, Palm toggle controls, a persistent high-visibility Emergency Stop button, UI button disabling when the manipulator is busy, and transient 2-second error banners for rejected commands.

## User Stories

### Operator Lifecycle & Pose Control
1. As an operator, I want to command the robotic arm to move to a canonical "Home" pose with a single button click, so that the manipulator returns to a known, safe starting posture.
2. As an operator, I want to command the robotic arm to move to a canonical "Ready" pose, so that the manipulator positions itself favorably above the workspace table.
3. As an operator, I want to command the robotic arm to move to an "Inspect" pose, so that the end-effector and gripped objects are positioned clearly in front of the camera viewpoint.
4. As an operator, I want canned trajectories to move the arm smoothly over a predictable 2-second interval, so that movements appear realistic and do not exhibit violent accelerations.
5. As an operator, I want the active lifecycle state of the robot (`BOOTING`, `IDLE`, `PROCESSING`, `EXECUTING`, `FAULT`) clearly indicated on the interface, so that I always know whether the manipulator is available for new commands.
6. As an operator, I want action buttons on the toolbar to be disabled whenever the robot is not `IDLE`, so that I am prevented from sending invalid commands while the arm is in motion.
7. As an operator, I want to be informed immediately via a transient warning banner if a command cannot be executed, so that I understand why the arm did not move without having to open developer consoles.

### End-Effector (Dexterous Palm) Operation
8. As an operator, I want to actuate the Dexterous Palm suction mechanism to grasp objects with a single click, so that I can hold parts during pick-and-place sequences.
9. As an operator, I want to actuate the Dexterous Palm suction mechanism to release objects with a single click, so that I can drop placed parts at destination stacks.
10. As an operator, I want the Palm actuation button to display the current grasping status, so that I immediately know whether suction is active.
11. As an operator, I want the Dexterous Palm nozzle in the 3D viewport to change color and glow when grasp is active, so that I have instant spatial confirmation of suction engagement.
12. As an operator, I want the Palm grasp and release actuation to exhibit a brief physical delay (~200ms), so that pneumatic pressurization and venting are realistically represented.

### Safety & Emergency Stop
13. As an operator, I want a prominent, permanent Emergency Stop button always visible and accessible on the interface, so that I can abort motion instantly under hazardous conditions.
14. As an operator, I want clicking the Emergency Stop button to immediately halt all joint motion within 50ms, so that collisions and equipment damage are prevented.
15. As an operator, I want clicking the Emergency Stop button to immediately transition the robot to the `FAULT` state, so that further motion commands are blocked until explicitly cleared.
16. As an operator, I want Emergency Stop commands to bypass all rate limiting and busy checks with highest priority, so that safety-critical halts are never delayed.
17. As an operator, I want a dedicated "Reset Fault" button that becomes active only when the robot is in `FAULT`, so that I can deliberately restore the system to operational readiness.
18. As an operator, I want resetting a fault to transition the arm directly to `IDLE` at its current position without moving any joints, so that uncommanded autonomous movement cannot cause unexpected injury or damage.

### Distributed Transport & Robustness
19. As a systems engineer, I want the Gateway to throttle incoming commands per active session to 20 Hz (50ms interval), so that malfunctioning clients or network loops cannot flood the DataFabric.
20. As a systems engineer, I want rate limit violations to return structured `ErrorFrame` messages over WebSocket without disconnecting the client, so that intermittent bursts do not sever the teleoperation session.
21. As a robotics engineer, I want the EdgeNode to enforce strict single-command gating without buffering commands in a queue, so that operator intent is deterministic and unexpected delayed movements are eliminated.
22. As a robotics engineer, I want incoming commands received while the arm is `PROCESSING` or `EXECUTING` to be rejected with a structured error and logged as warnings, so that active trajectories continue without interruption.
23. As a software architect, I want wire contracts for command payloads and telemetry events defined in canonical JSON schemas and generated across Python, Rust, and TypeScript, so that cross-service deserialization errors are eliminated at compile time.
24. As a frontend developer, I want Dexterous Palm grasp indicators in Three.js synchronized via a non-reactive mutable buffer reference, so that 30 Hz telemetry updates never trigger expensive Virtual-DOM reconciliation.
25. As a test engineer, I want an automated end-to-end multi-service test suite verifying live command dispatch, state transitions, palm actuation, and emergency stop halt across all three running tiers within sub-50ms latency budgets.

## Implementation Decisions

### 1. Architectural Tier Boundaries & Clean Module Decomposition
- **Gateway**: Remains a stateless transport boundary service. Enforces single `ActiveSession` exclusivity, applies a stateless 20 Hz minimum-interval throttle (50ms) per session, validates Serde schema syntax, and publishes valid commands to `robot/{id}/command`. Gateway does not track manipulator kinematics or lifecycle state.
- **EdgeNode**: Authoritative domain owner of the manipulator lifecycle and motion execution. Subscribes to `robot/{id}/command`, validates domain preconditions (`SingleCommandGating`), executes trajectory interpolation or dispatches to ROS2 controllers, and emits 30 Hz `RobotTelemetryEvent` frames to `robot/{id}/telemetry`.
- **TeleopClient**: Browser UI managing the WebSocket connection, updating the 3D `RobotVisualizer` via non-reactive reference buffers, rendering numerical telemetry, and providing operator controls with UI interlocks.

### 2. Domain Schema & Actuation Contracts
- **Command Schema**: Extends `schemas/robot_command.schema.json` with new `CommandType` variants: `PALM_ACTUATE`, `TRAJECTORY_EXECUTE`, `EMERGENCY_STOP`, and `RESET_FAULT`. The root `payload` field remains a generic object across all languages, while typed sub-models are formally defined in `schemas/`:
  - `PalmActuatePayload`: `{ "action": "GRASP" | "RELEASE" }`
  - `TrajectoryExecutePayload`: `{ "pose_name": "HOME" | "READY" | "INSPECT_POSE", "waypoints": optional }`
  - `EmergencyStopPayload`: `{ "reason": optional string }`
  - `ResetFaultPayload`: `{}`
- **Telemetry Schema**: Extends `schemas/robot_telemetry_event.schema.json` to make `palm_state` a mandatory property:
  - `palm_state`: `{ "is_grasped": boolean }` defaulting to `false` upon initialization.
- **Code Generation**: Cross-language bindings are generated via `scripts/generate_domain.py` into Python Pydantic models, Rust Serde structs, and TypeScript Zod schemas.

### 3. EdgeNode Lifecycle State Machine & SingleCommandGating
- Authoritative state machine:
  - States: `BOOTING`, `IDLE`, `PROCESSING`, `EXECUTING`, `FAULT`.
  - Initial State: `BOOTING` transitions to `IDLE` upon successful Zenoh and ROS2 connection initialization.
  - Command Admission: Incoming motion commands (`TRAJECTORY_EXECUTE`) and actuation commands (`PALM_ACTUATE`) are admitted **only** when `RobotState == IDLE`.
  - Rejection Semantics: Any command arriving when state is `PROCESSING` or `EXECUTING` is rejected with an emitted `ErrorFrame` (`error_code: "ROBOT_BUSY"`), logged at `WARNING` level, and dropped. No FIFO command queue is maintained.
  - Motion Abortion: `EMERGENCY_STOP` transitions any state immediately to `FAULT`, canceling active trajectory timers/controllers and commanding zero velocities.
  - Fault Clearance: `RESET_FAULT` transitions `FAULT` directly to `IDLE` at the current joint positions without initiating autonomous motion.

### 4. Dexterous Palm Procedural 3D Model & Kinematic Synchronization
- The Dexterous Palm pneumatic suction tool is procedurally constructed using native Three.js geometries and parented directly to UR5e link `tool0` (`URDFRobot.links['tool0']`):
  - Aluminum mounting baseplate (cylinder: radius 0.04m, height 0.015m, metallic finish).
  - Pneumatic extension rod (cylinder: radius 0.01m, height 0.04m, dark metal finish).
  - Industrial suction cup bellows nozzle (cone/cylinder: radius 0.025m, height 0.02m, rubber finish).
- Kinematic Synchronization: Ingests `palm_state` via `telemetryBufferRef`. The 60 FPS animation loop evaluates `is_grasped` against its previous state; upon transition, it updates the suction nozzle material emissive glow directly without triggering Preact component re-renders.

### 5. Canned Trajectories & Motion Simulation
- Canonical 6-DoF UR5e joint postures (radians):
  - `HOME`: `[0.0, -1.5708, 0.0, -1.5708, 0.0, 0.0]`
  - `READY`: `[0.0, -0.7854, 1.5708, -0.7854, -1.5708, 0.0]`
  - `INSPECT_POSE`: `[0.0, -1.0472, 1.3963, -1.9198, -1.5708, 0.0]`
- Standalone / Mock Interpolation: Moves between current joint positions and target pose over 2.0 seconds using smooth cubic Hermite interpolation ($s(t) = 3t^2 - 2t^3$) sampled at 30 Hz. Transitions `IDLE` $\to$ `PROCESSING` (50ms planning phase) $\to$ `EXECUTING` (2.0s motion) $\to$ `IDLE`.

### 6. Gateway 20 Hz Throttling
- Implements a 50ms minimum-interval timer per `ActiveSession`.
- Inbound non-emergency commands arriving $<50\text{ms}$ since the previous command are rejected with `ErrorFrame` (`error_code: "RATE_LIMIT_EXCEEDED"`).
- `EMERGENCY_STOP` unconditionally bypasses the rate limiter and resets the interval clock.

### 7. TeleopClient Operator Toolbar & Error UX
- Placed directly beneath the 3D viewport canvas.
- Structure:
  - Left: Canned pose buttons (`Home`, `Ready`, `Inspect`).
  - Center: Palm toggle button (`Grasp` / `Release` with status pill).
  - Right: Safety cluster with `Reset Fault` button and high-visibility red `EMERGENCY STOP` button.
- Interlocks: Action buttons disabled when `robot_state !== 'IDLE'`. `Reset Fault` enabled only when `robot_state === 'FAULT'`. `EMERGENCY STOP` permanently enabled.
- Error Presentation: Inbound error frames append to the Telemetry Event Log and trigger a transient 2-second red warning banner across the toolbar.

## Testing Decisions

### What Makes a Good Test
Tests must verify externally observable behavior and contract boundaries rather than private implementation details:
- Assert wire frames match serialized schemas across Python, Rust, and TypeScript.
- Assert service boundaries reject invalid inputs with structured error frames without crashing or severing connections.
- Assert state transitions and kinematic transformations occur accurately within specified time budgets (<50ms).

### Primary Testing Seams
1. **Multi-Service Integration Seam (Highest Seam)**:
   - Automated end-to-end integration test (Playwright / Cucumber) concurrently launching `EdgeNode`, `Gateway`, and `TeleopClient`.
   - Simulates operator clicking "Ready" $\to$ asserts state transitions (`IDLE` $\to$ `PROCESSING` $\to$ `EXECUTING` $\to$ `IDLE`), arm arrives at target pose, and latency < 50ms.
   - Simulates operator clicking "Grasp" $\to$ asserts state cycle, palm visual indicator shift, and telemetry confirmation.
   - Simulates operator triggering "EMERGENCY STOP" during motion $\to$ asserts arm motion freezes immediately (<50ms), state transitions to `FAULT`, and toolbar buttons lock.
   - Simulates operator clicking "Reset Fault" $\to$ asserts state transitions to `IDLE` at current pose without joint movement.

2. **Hermetic Subsystem Seams**:
   - **Domain Serialization**: Cross-language contract tests in Rust (`cargo nextest`), Python (`pytest`), and TypeScript (`vitest`) verifying typed serialization of all new payloads and `palm_state`.
   - **Gateway Boundary**: `cargo nextest` suite verifying 20 Hz throttling rejection, `EMERGENCY_STOP` bypass, and structured error emission.
   - **EdgeNode Lifecycle**: `pytest` suite verifying state machine transitions, `SingleCommandGating` busy rejections, pneumatic delay, and cubic trajectory interpolation.
   - **TeleopClient Component**: `vitest` suite verifying toolbar rendering, button state interlocks, non-reactive grasp indicator updates, and transient error banners.

### Prior Art
- `src/gateway/tests/ws_gateway_test.rs`: Testing WebSocket session guards, frame validation, and error frames against mock DataFabric.
- `tests/test_edge_node.py` & `tests/test_domain.py`: Testing EdgeNode command ingestion and Pydantic serialization.
- `web/tests/unit/TeleopClient.test.tsx` & `web/tests/unit/RobotVisualizer.test.tsx`: Component test patterns for WebSocket mocking and Three.js canvas lifecycles.
- `web/tests/e2e/steps/dynamic_motion.steps.ts`: Multi-service Playwright integration orchestration.

## Out of Scope

- Live Gazebo Harmonic physics simulation startup (deferred to Phase 5 per ADR-0001).
- Physical suction force simulation, vacuum sensor dynamics, or workpiece surface deformation.
- Autonomous visual pick-and-place, analytical inverse kinematics, and object spawning (reserved for Units 5–8).
- Multi-client concurrent control or fleet coordination (restricted to single `ActiveSession` per robot).
- Complex multi-point cubic spline trajectory editing or manual joint jog sliders in UI.

## Further Notes

- Aligns with single-command interaction model agreed during Unit 4 grilling session.
- Deprecates speculative FIFO `CommandQueue` in favor of deterministic `SingleCommandGating`, keeping architecture minimal, robust, and aligned with Phase 1–3 design patterns.

## Completion Summary

Phase 4 (Units 4.0 to 4.5) fully implemented, verified, and integrated:
- Unit 4.0: Contract-first domain schemas for palm actuation, canned trajectories, and palm_state telemetry.
- Unit 4.1: Dexterous Palm procedural 3D model with real-time visual grasp feedback in RobotVisualizer.
- Unit 4.2: Authoritative EdgeNode lifecycle state machine with SingleCommandGating and cubic Hermite trajectory interpolation.
- Unit 4.3: Gateway 20 Hz rate limiting, emergency stop bypass, and structured error emission.
- Unit 4.4: TeleopClient OperatorToolbar with canned poses, palm toggling, safety cluster, and transient error banners.
- Unit 4.5: Closed-loop multi-service integration suite (Playwright + Cucumber) verifying end-to-end telemetry and command workflows.
- Fix: Resolved split-brain telemetry conflict between mock_motion_publisher and EdgeNode, and enhanced palm 3D visibility.
