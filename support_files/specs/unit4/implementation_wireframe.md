> [!IMPORTANT]
> Aligns with [units.md](../units.md#unit-4-dexterous-palm-integration--actuation-foundation). Use the vertical walking skeleton defined in Unit 4 as the canonical Unit 4 specification. In this unit, we establish the end-effector hardware model (Dexterous Palm pneumatic suction tool on `tool0`), the authoritative lifecycle state machine with bounded command FIFO queue ($N=5$) and E-Stop purge, Gateway 20 Hz safety gating, and canned trajectory triggers.

Welcome to Unit 4: Dexterous Palm Integration & Actuation Foundation. This unit builds the foundation for automated closed-loop pick-and-place manipulation (Units 5–8) by integrating the end-effector into the kinematic chain and securing the bidirectional control and state loop across all three architectural tiers.

------------------------------
## Contract-First Parallel Execution Model

Development strictly follows interface boundaries. Once wire schemas are locked in Unit 4.0, the 3D Palm visualizer model (Unit 4.1), EdgeNode state machine & queue (Unit 4.2), Gateway safety gating (Unit 4.3), and TeleopClient toolbar controls (Unit 4.4) execute concurrently against mocked interface seams. Only the final multi-service system integration suite (Unit 4.5) depends on all components.

```
                    ┌────────────────────────────────────────────────────────┐
                    │ Unit 4.0: Domain Schemas & Palm Contracts (Stage 0)    │
                    │ (Wire schemas, scripts/generate_domain.py, tests)      │
                    └───────────────────────────┬────────────────────────────┘
                                                │
         ┌──────────────────────┬───────────────┴───────────────┬──────────────────────┐
         │                      │                               │                      │
         ▼                      ▼                               ▼                      ▼
┌─────────────────┐   ┌─────────────────────────────┐   ┌────────────────┐   ┌───────────────────┐
│ Unit 4.1: Web   │   │ Unit 4.2: EdgeNode          │   │ Unit 4.3: GW   │   │ Unit 4.4: Web     │
│ 3D Palm on tool0│   │ State Machine & FIFO Queue  │   │ 20Hz Throttling│   │ Operator Toolbar  │
│ (Visualizer seam│   │ (Tested vs mock ROS2/Zenoh) │   │ (Cargo nextest)│   │ (Vitest component)│
└────────┬────────┘   └──────────────┬──────────────┘   └───────┬────────┘   └─────────┬─────────┘
         │                           │                          │                      │
         └───────────────────────────┴──────────┬───────────────┴──────────────────────┘
                                                │
                                                ▼
                    ┌────────────────────────────────────────────────────────┐
                    │ Unit 4.5: Closed-Loop Multi-Service E2E Suite (Final)  │
                    │ (Live integration: Web + GW + EdgeNode + Controller)   │
                    └────────────────────────────────────────────────────────┘
```

---

## Step 1: Domain Schemas & Palm Actuation Contracts (Unit 4.0)

Lock down the serialization schemas across Rust, Python, and TypeScript before implementing node logic.

1. **Wire Schemas Update**:
   - `schemas/robot_command.schema.json`:
     - Add `PALM_ACTUATE` to `CommandType` enum with payload:
       ```json
       {
         "type": "object",
         "required": ["action"],
         "properties": {
           "action": { "type": "string", "enum": ["GRASP", "RELEASE"] }
         },
         "additionalProperties": false
       }
       ```
     - Type `TRAJECTORY_EXECUTE` payload with canned names (`"HOME"`, `"READY"`, `"INSPECT_POSE"`) and optional waypoint arrays.
     - Type `EMERGENCY_STOP` payload with optional `reason: string`.
     - Type `RESET_FAULT` payload as `{}`.
   - `schemas/robot_telemetry_event.schema.json`:
     - Add `palm_state`:
       ```json
       {
         "type": ["object", "null"],
         "properties": {
           "is_grasped": { "type": "boolean" }
         },
         "required": ["is_grasped"]
       }
       ```
2. **Code Generation**:
   - Run `python scripts/generate_domain.py` to regenerate:
     - `src/domain/domain.py` (Pydantic models)
     - `src/domain/domain.rs` (Serde models)
     - `web/domain/contracts.ts` (Zod schemas & TypeScript types)
3. **Cross-Language TDD Contract Tests**:
   - Python: `pytest tests/test_domain_contracts.py`
   - Rust: `cargo nextest run -p gateway --lib`
   - Web: `npm --prefix web run test`

---

## Step 2: Dexterous Palm 3D Model & Kinematic Flange Mounting (Unit 4.1)

Render the physical end-effector in the Three.js viewport without external mesh dependency.

1. **Procedural Suction Tool Geometry**:
   - Build a clean procedural pneumatic suction tool parented directly to UR5e flange `tool0` (`URDFRobot.links['tool0']`):
     - Aluminum mounting plate (cylinder: radius $0.04\text{m}$, height $0.015\text{m}$, metallic gray).
     - Pneumatic extension rod (cylinder: radius $0.01\text{m}$, height $0.04\text{m}$, dark metal).
     - Rubber suction cup bellows / nozzle (cone/cylinder: radius $0.025\text{m}$, height $0.02\text{m}$, industrial black rubber).
2. **Visual Grasp State Indication**:
   - When `palm_state.is_grasped === true`, suction nozzle material transitions to active visual indicator (subtle glow / teal highlight).
   - When `false`, reverts to default dark rubber.
3. **TDD Verification (`vitest`)**:
   - Assert `tool0` link has suction tool child attached.
   - Assert grasp state updates trigger visual material state changes cleanly.

---

## Step 3: EdgeNode Lifecycle State Machine & ROS2 Controller Dispatch (Unit 4.2)

Implement the authoritative lifecycle state machine, bounded command queue, and controller dispatch inside EdgeNode.

1. **Lifecycle State Machine**:
   - States: `BOOTING`, `IDLE`, `PROCESSING`, `EXECUTING`, `FAULT`.
   - Transitions:
     - `BOOTING` $\to$ `IDLE`: subscriptions and session ready.
     - `IDLE` $\to$ `PROCESSING`: upon valid command receipt.
     - `PROCESSING` $\to$ `EXECUTING`: trajectory planned / controller active.
     - `EXECUTING` $\to$ `IDLE`: trajectory motion completed.
     - `*` $\to$ `FAULT`: on `EMERGENCY_STOP` or controller failure.
     - `FAULT` $\to$ `IDLE`: on `RESET_FAULT`.
2. **Bounded Command Queue (FIFO $N=5$)**:
   - When in `EXECUTING`, valid motion commands are pushed to an internal FIFO queue (capacity 5).
   - If queue exceeds 5, reject with `QUEUE_FULL` error frame.
   - When active motion completes, pop next command and execute.
3. **Emergency Stop Override**:
   - `EMERGENCY_STOP` immediately cancels active controller motion, purges the FIFO queue completely, and sets `robot_state = RobotState.FAULT`.
4. **Trajectory & Palm Dispatch**:
   - Canned poses:
     - `"HOME"`: `[0.0, -1.5708, 0.0, -1.5708, 0.0, 0.0]`
     - `"READY"`: `[0.0, -0.7854, 1.5708, -0.7854, -1.5708, 0.0]`
     - `"INSPECT_POSE"`: `[0.0, -1.0472, 1.3963, -1.9198, -1.5708, 0.0]`
   - Dispatches to ROS2 controller (`joint_trajectory_controller`) with cubic interpolation fallback in mock mode.
5. **TDD Verification (`pytest`)**:
   - Test state machine valid and invalid transitions.
   - Test FIFO queueing during `EXECUTING` and automatic next execution.
   - Test `EMERGENCY_STOP` queue purge and immediate transition to `FAULT`.
   - Test `PALM_ACTUATE` updates `palm_state` in emitted telemetry.

---

## Step 4: Gateway Safety Gating & 20 Hz Command Throttling (Unit 4.3)

Ensure the Gateway enforces boundary defense without state synchronization complexity.

1. **Stateless Syntactic & Limit Validation**:
   - Enforces valid Serde schema.
   - Enforces 6-DoF joint limits $[-\pi, \pi]$ and finite floating point numbers.
2. **20 Hz Command Rate Throttling**:
   - Enforces minimum 50ms interval between non-priority commands per ActiveSession.
   - `EMERGENCY_STOP` bypasses rate limiting immediately.
3. **Structured Error Emission**:
   - Emits structured `ErrorFrame` on violations without dropping the WebSocket connection.
4. **TDD Verification (`cargo nextest`)**:
   - Test rate limiter drops/rejects command spamming (>20 Hz).
   - Test E-Stop bypasses rate limiter instantly.
   - Test invalid schemas emit structured `ErrorFrame`.

---

## Step 5: TeleopClient Operator Toolbar & Controls (Unit 4.4)

Provide a sleek, intuitive operator control strip directly beneath the 3D showroom canvas.

1. **Horizontal Operator Toolbar**:
   - Placed directly under the 75% 3D Three.js canvas.
   - Buttons:
     - Canned Poses: `"Home"`, `"Ready"`, `"Inspect"`.
     - Palm Actuation: `"Grasp" / "Release"` toggle.
     - Reset: `"Reset Fault"` (active only when `robot_state === 'FAULT'`).
2. **Persistent Emergency Stop & Status Header**:
   - Prominent red `"EMERGENCY STOP"` button and `RobotState` badge permanently visible.
3. **UI Interlocks**:
   - Action buttons disabled whenever `robot_state !== 'IDLE'`.
4. **TDD Verification (`vitest`)**:
   - Assert button clicks dispatch correct `RobotCommand` frames over WebSocket.
   - Assert buttons disable when `robot_state === 'EXECUTING'` or `'FAULT'`.
   - Assert Emergency Stop dispatches instantly regardless of state.

---

## Step 6: Closed-Loop Multi-Service Integration Suite (Unit 4.5)

Verify full end-to-end wire integration across all three tiers concurrently.

1. **Multi-Service Automated Test**:
   - Launches EdgeNode, Gateway, and TeleopClient.
   - Dispatches `"Ready"` canned pose $\to$ asserts state transitions `IDLE` $\to$ `PROCESSING` $\to$ `EXECUTING` $\to$ `IDLE`.
   - Dispatches `"Grasp"` $\to$ asserts palm visual state updates in Three.js and telemetry reflects `is_grasped: true`.
   - Dispatches `"EMERGENCY STOP"` during motion $\to$ asserts motion halts within < 50ms, state transitions to `FAULT`, and queued commands are purged.
