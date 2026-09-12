> [!IMPORTANT]
> Aligns with [units.md](../units.md#unit-2-continuous-6-dof-ur5e-telemetry-stream) and [dev_phases.md](../dev_phases.md#phase-2-frame-aggregation--zero-state-telemetry). Use the vertical walking skeleton defined in Unit 2 as the canonical Phase 2 specification.

Welcome to Phase 2: Frame Aggregation & Zero-State Telemetry. As a senior engineer, our goal is to evolve the system from the discrete Phase 1 "Ping-Pong" verification loop into a continuous, high-frequency telemetry streaming pipeline for the 6-DoF UR5e kinematic chain. We are building a robust, low-latency data artery engineered specifically to run glitch-free on standard and low-end client hardware.
--
We will apply Domain-Driven Design (DDD), Clean Architecture, and Specification-Driven Development (SDD) with strict TDD. By the end of this phase, a 30 Hz ROS2 `JointState` source (via standalone mock publisher or test fixture) will stream into EdgeNode, extract canonical UR5e angles via named lookup with zero-order hold (resilient to future gripper additions), serialize typed `RobotTelemetryEvent` frames over DataFabric, flow through the Rust Actix-web Gateway multiplexer, and hydrate a non-reactive reference buffer in TeleopClient. Telemetry values will paint directly via `requestAnimationFrame` without VDOM re-rendering overhead, while TeleopClient features a prominent telemetry showcase. Because an active stream inherently verifies connectivity, connection verification controls are completely removed from the DOM during streaming.

Here is the exact step-by-step execution plan.
------------------------------
## Contract-First Parallel Execution Model

Development strictly follows interface boundaries. Once domain schemas and generated cross-language types are synchronized in Unit 2.0, the three service layers (Units 2.1, 2.2, 2.3) execute concurrently against mocked interface seams. Only the final system integration suite (Unit 2.4) depends on all three layers.

```
                    ┌────────────────────────────────────────────────────────┐
                    │ Unit 2.0: Domain Schemas & Joint Constants Sync        │
                    │ (Verify schemas, codify UR5e joint names, re-generate) │
                    └───────────────────────────┬────────────────────────────┘
                                                │
                 ┌──────────────────────────────┼──────────────────────────────┐
                 │                              │                              │
                 ▼                              ▼                              ▼
┌─────────────────────────────────┐ ┌─────────────────────────────┐ ┌─────────────────────────────────┐
│ Unit 2.1: EdgeNode              │ │ Unit 2.2: Gateway           │ │ Unit 2.3: TeleopClient          │
│ Ingestion & Mock Publisher      │ │ 30 Hz Telemetry Forwarding  │ │ Telemetry Showcase & Direct DOM │
│ (Tested vs ROS2/Zenoh mock)     │ │ (Tested vs Zenoh mock)      │ │ (Tested vs WS mock)             │
└────────────────┬────────────────┘ └──────────────┬──────────────┘ └────────────────┬────────────────┘
                 │                                 │                                 │
                 └──────────────────────────────┬──┴─────────────────────────────────┘
                                                │
                                                ▼
                    ┌────────────────────────────────────────────────────────┐
                    │ Unit 2.4: Multi-Service 30 Hz E2E Playwright Suite     │
                    │ (Live integration of EdgeNode + Gateway + TeleopClient)│
                    └────────────────────────────────────────────────────────┘
```

## Step 1: Named JointState Extractor & Hybrid Mock Publisher (EdgeNode / Python)
In ROS2 simulation environments, joint states are broadcast on `/joint_states` via `sensor_msgs/msg/JointState`. In Phase 2, we ingest zero-state coordinates while preparing for real Gazebo physics (Phase 3) and future gripper additions (Phase 4/5).

1. **The Canonical UR5e Extractor (`JointStateMapper`)**:
   - Define canonical UR5e joint sequence:
     `UR5E_JOINTS = ["shoulder_pan_joint", "shoulder_lift_joint", "elbow_joint", "wrist_1_joint", "wrist_2_joint", "wrist_3_joint"]`.
   - Maintain a zero-order hold dictionary mapping joint names to last known good angles (initialized to `0.0` rad).
   - Ignore extraneous joints (e.g. gripper joints like `robotiq_85_*` or world links) so adding new joints in future phases will not break arm telemetry extraction.
   - Output is strictly validated as an `ArmJointPositions` array (exactly 6 floats in radians).
2. **Hybrid Mock Architecture**:
   - Standalone Script: Create `src/edge_node/mock_publisher.py`, an independent ROS2 node publishing synthetic zero-state `sensor_msgs/msg/JointState` frames at 30 Hz to `/joint_states` over native DDS.
   - Offline In-Memory Fixture: Provide a test harness allowing EdgeNode to receive simulated `JointState` callbacks directly in `pytest` without spinning external DDS processes.
3. **TDD Verification (`pytest`)**:
   - Out-of-order joint names in `JointState` map to canonical UR5e indices correctly.
   - Extraneous joints are safely discarded.
   - Missing joints preserve last valid values via zero-order hold (or default to `0.0`).
   - Non-finite values (NaN/Inf) are rejected or clamped with diagnostic warnings.

## Step 2: Continuous 30 Hz Telemetry Streaming Loop (EdgeNode / Python)
Wire the continuous telemetry streaming loop within EdgeNode to deliver predictable 30 Hz output over DataFabric.

1. **ROS2 Subscription**: Subscribe EdgeNode to the `/joint_states` topic (`sensor_msgs/msg/JointState`).
2. **Deterministic 30 Hz Streaming**:
   - Cache latest mapped `ArmJointPositions` on incoming ROS2 callbacks.
   - Emit typed `RobotTelemetryEvent` over DataFabric topic `robot/{id}/telemetry` at 30 Hz (33.3ms period):
     - `timestamp_ns`: Current Unix epoch nanoseconds.
     - `robot_state`: Current lifecycle state (`RobotState.IDLE`).
     - `joint_positions`: 6-element UR5e float array.
     - `inference_metrics`: `None` (reserved for Phase 4 ONNX vision).
3. **TDD Verification (`pytest`)**:
   - Verify that simulated `/joint_states` inputs trigger DataFabric telemetry publication adhering strictly to `schemas/robot_telemetry_event.schema.json`.
   - Assert timer loop maintains stable 30 Hz cadence.

## Step 3: Gateway Stream Multiplexing & High-Throughput Forwarding (Gateway / Rust)
Gateway demultiplexes DataFabric pub/sub events directly to the active browser WebSocket session at 30 Hz without queue lag or memory leaks.

1. **DataFabric Subscriber Worker**: In `src/gateway`, ensure the DataFabric subscriber for `robot/{id}/telemetry` runs as an asynchronous Tokio worker.
2. **ActiveSession Forwarding**: Forward incoming telemetry frames directly to the ActiveSession WebSocket channel for the corresponding `robot_id`.
3. **Queue Sizing & Flow Control**:
   - Configure channel buffers sized appropriately for 30 Hz streaming to ensure zero frame drops under normal network conditions.
   - Protect against deadlocks or unconsumed frames if a client disconnects unexpectedly.
4. **TDD Verification (`cargo nextest`)**:
   - Integration tests injecting synthetic telemetry streams at 30 Hz into the DataFabric mock and asserting continuous WebSocket delivery to ActiveSession.
   - Verify ActiveSession cleanup on client disconnection during active streaming.

## Step 4: Non-Reactive Ingestion & Direct DOM Painting (TeleopClient / Preact)
To ensure the demo runs butter-smooth without lags or glitches on standard and low-end hardware, we eliminate Virtual-DOM diffing overhead during 30 Hz streaming.

1. **Non-Reactive Ingestion Buffer (`useTelemetryStream.ts`)**:
   - Maintain latest `ArmJointPositions` inside a `useRef<[number, number, number, number, number, number]>` buffer.
   - Inbound WebSocket telemetry frames update this mutable ref synchronously on arrival.
2. **Zero-VDOM Direct DOM Updates (`TelemetryMonitor.tsx`)**:
   - Attach direct DOM element refs to the numerical joint readouts.
   - In a `requestAnimationFrame` loop, update DOM text nodes directly (`ref.current.textContent = val.toFixed(3) + " rad"`).
   - This bypasses Preact's component re-render cycle entirely during telemetry streaming, consuming near-zero CPU and causing no garbage collection pauses.
3. **Throttled Metadata State**:
   - Limit Preact reactive state updates to low-frequency events: `RobotState` transitions (`DISCONNECTED` -> `CONNECTED / IDLE`), connection health, and a 1-second rolling stream frequency counter (Hz).
4. **User Interface Layout & Connection Stream Coherence**:
   - **Primary Showcase (Always Visible)**: The `TelemetryMonitor` panel is prominently positioned at the center of TeleopClient, displaying:
     - Operational State badge (`IDLE`, `BOOTING`, `FAULT`).
     - Streaming Rate indicator (`~30 Hz`).
     - Timestamp latency metric (`< 50 ms`).
     - 6-DoF Joint Grid: Clean numerical readouts for each canonical UR5e joint showing radians and degrees.
   - **Stream-Aware Connection Verification**:
     - When telemetry is actively streaming, connection is already self-evident and proven. TeleopClient completely removes "Verify connection" / Ping controls from the DOM.
     - "Verify connection" controls are only rendered when disconnected or idle before the initial telemetry stream is established.
5. **TDD Verification (`vitest`)**:
   - Unit tests verifying that incoming telemetry frames update the non-reactive ref buffer and transition state to `CONNECTED / IDLE`.
   - Assert that receiving 30 frames/sec does not trigger continuous VDOM re-renders on the parent component.
   - Assert "Verify connection" / Ping controls are removed from the DOM once an active telemetry stream is detected.

## Step 5: Cross-Language Schema Alignment & Boundary Validation
1. **Schema Compliance**: Verify all tiers adhere to `schemas/robot_telemetry_event.schema.json`:
   - `joint_positions`: exactly 6 items, valid floats, no NaN/Infinity.
   - `timestamp_ns`: integer nanoseconds.
   - `robot_state`: valid enum value.
2. **Low-End Hardware Stability Check**:
   - Run a sustained 60-second 30 Hz streaming test.
   - Assert zero memory growth, zero frame accumulation, and steady 30 Hz delivery.

------------------------------
## The Integration Verification (The Continuous Telemetry Test)
Once all steps are implemented, verify the complete Phase 2 vertical slice:

1. Launch mock publisher: `python -m src.edge_node.mock_publisher --rate 30`.
2. Start EdgeNode: `python -m src.edge_node.main`.
3. Start Gateway: `cargo run -p gateway`.
4. Launch TeleopClient: `npm --prefix web run dev`.
5. Open TeleopClient in browser:
   - Telemetry showcase is immediately visible.
   - State badge transitions to `CONNECTED / IDLE`.
   - Streaming rate displays `~30 Hz` with latency `< 50 ms`.
   - 6 joint cards display `0.000 rad (0.0°)`.
   - "Verify connection" / Ping controls are removed from the DOM as the live stream confirms connectivity.

------------------------------
### Ready to Begin Implementation
Choose the initial component to implement:
1. **EdgeNode (Python)**: Implement `JointStateMapper` with zero-order hold and `mock_publisher.py` with pytest test coverage.
2. **Gateway (Rust)**: Verify continuous 30 Hz DataFabric telemetry streaming and WebSocket forwarding with nextest.
3. **TeleopClient (Preact)**: Implement non-reactive `useTelemetryStream` hook, direct DOM `TelemetryMonitor`, and stream-aware DOM cleanup with vitest.
