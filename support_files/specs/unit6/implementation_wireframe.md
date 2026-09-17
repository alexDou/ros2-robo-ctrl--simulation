> [!IMPORTANT]
> Aligns with [units.md](../units.md#unit-6-autonomous-pick-and-place-to-common-destination) and [ADR 0003](../../docs/adr/0003-analytical-ur5e-ik-and-event-driven-workcell.md). In this unit, we establish closed-loop autonomous pick-and-place manipulation from table landing coordinates to a dedicated SpindleTower destination. This includes `PICK_AND_PLACE_TARGET` wire schemas, pure Python analytical UR5e inverse kinematics with downward orientation constraint and 0.108m TCP offset, decoupled event-driven `WorkcellState` with tower inventory tracking, Gateway validation, Three.js `KinematicLinkAttachment` with FIFO bottom-drop stacking, and automated multi-service system integration.

Welcome to Unit 6: Autonomous Pick-and-Place to Common Destination. This unit provides the foundational autonomous manipulation capability, enabling operators to trigger complete pick, transfer, and stacking sequences by clicking valid table coordinates.

------------------------------
## Contract-First Parallel Execution Model

Development strictly follows interface boundaries. Once wire schemas and cross-language domain types are locked in Unit 6.0, the Analytical Inverse Kinematics solver (Unit 6.1), EdgeNode `WorkcellState` & execution engine (Unit 6.2), Gateway validation (Unit 6.3), and TeleopClient 3D SpindleTower & link attachment (Unit 6.4) execute concurrently against mocked interface seams. Only the final multi-service system integration suite (Unit 6.5) depends on all components.

```
                    ┌────────────────────────────────────────────────────────┐
                    │ Unit 6.0: Domain Schemas & Wire Contracts (Stage 0)    │
                    │ (Wire schemas, scripts/generate_domain.py, tests)      │
                    └───────────────────────────┬────────────────────────────┘
                                                │
          ┌──────────────────────┬───────────────┴───────────────┬──────────────────────┐
          │                      │                               │                      │
          ▼                      ▼                               ▼                      ▼
┌─────────────────┐   ┌─────────────────────────────┐   ┌────────────────┐   ┌───────────────────┐
│ Unit 6.1: Py    │   │ Unit 6.2: EdgeNode          │   │ Unit 6.3: GW   │   │ Unit 6.4: Web     │
│ Analytical IK   │   │ WorkcellState & Trajectory  │   │ Schema Validate│   │ SpindleTower &    │
│ (Pytest offline)│   │ (Event seam vs mock IK)     │   │ (Cargo nextest)│   │ KinematicLink (UI)│
└────────┬────────┘   └──────────────┬──────────────┘   └───────┬────────┘   └─────────┬─────────┘
          │                           │                          │                      │
          └───────────────────────────┴──────────┬───────────────┴──────────────────────┘
                                                 │
                                                 ▼
                    ┌────────────────────────────────────────────────────────┐
                    │ Unit 6.5: Multi-Service Closed-Loop System Integration │
                    │ (Live integration: Web + GW + EdgeNode + DataFabric)   │
                    └────────────────────────────────────────────────────────┘
```

---

## Step 1: Domain Schemas, Wire Contracts & Cross-Language Types (Unit 6.0)

Lock down serialization schemas across Rust, Python, and TypeScript before implementing node logic.

1. **Wire Schemas Update**:
   - In `schemas/robot_command.schema.json`, add `PICK_AND_PLACE_TARGET` to `CommandType` enum with payload:
     ```json
     {
       "type": "object",
       "title": "PickAndPlaceTargetPayload",
       "required": ["pick_x", "pick_y", "pick_z"],
       "properties": {
         "pick_x": { "type": "number", "description": "Cartesian X pick coordinate in robot base frame" },
         "pick_y": { "type": "number", "description": "Cartesian Y pick coordinate in robot base frame" },
         "pick_z": { "type": "number", "description": "Cartesian Z pick coordinate in robot base frame" },
         "drop_x": { "type": "number", "description": "Optional custom Cartesian X drop target coordinate" },
         "drop_y": { "type": "number", "description": "Optional custom Cartesian Y drop target coordinate" },
         "drop_z": { "type": "number", "description": "Optional custom Cartesian Z drop target coordinate" }
       },
       "additionalProperties": false
     }
     ```
2. **Code Generation**:
   - Run `python scripts/generate_domain.py` to regenerate:
     - `src/domain/domain.py` (Pydantic models)
     - `src/domain/domain.rs` (Serde models)
     - `web/domain/contracts.ts` (Zod schemas & TypeScript types)
3. **Helper Command Builders**:
   - In `web/domain/parsers.ts`, add builder `createPickAndPlaceTargetCommand(pick, drop?)`.
4. **Cross-Language TDD Contract Tests**:
   - Python: `pytest tests/test_domain_contracts.py`
   - Rust: `cargo nextest run -p gateway --test domain_contract_test`
   - Web: `npm --prefix web run test`

---

## Step 2: Analytical UR5e Inverse Kinematics Solver & Waypoint Planner (Unit 6.1)

Implement pure Python analytical closed-form IK solver for deterministic sub-millisecond execution without MoveIt2 dependencies per [ADR 0003](../../docs/adr/0003-analytical-ur5e-ik-and-event-driven-workcell.md).

1. **Analytical Closed-Form Solver**:
   - Implements standard UR5e Denavit-Hartenberg parameters ($d = [0.1625, 0, 0, 0.1333, 0.0997, 0.0996]\text{m}$, $a = [0, -0.425, -0.3922, 0, 0, 0]\text{m}$, $\alpha = [\pi/2, 0, 0, \pi/2, -\pi/2, 0]$).
   - Constrains tool orientation to vertical downward suction cup normal ($Z$-down, roll/pitch aligned with table normal).
   - Explicitly incorporates DexterousPalm Tool Center Point (TCP) offset: $L_{\text{tool}} = 0.108\text{m}$ along tool $Z$-axis.
   - Solves the 8 kinematic branches analytically in closed-form.
   - Filters out solutions outside joint limits $[-\pi, \pi]$ and singularity boundaries.
   - Selects the branch with minimal Euclidean angular displacement from current joint positions ($\min \|\mathbf{q} - \mathbf{q}_{\text{current}}\|_2$) to prevent erratic multi-revolution flips.
   - Rejects unreachable targets ($R < 0.20\text{m}$ or $R > 0.85\text{m}$) with descriptive domain exception.
2. **Deterministic 10-Step Waypoint Trajectory Sequence**:
   - Computes joint configurations for the standard pick-and-place sequence:
     1. $P_{\text{approach}} = (x_{\text{pick}}, y_{\text{pick}}, z_{\text{pick}} + 0.10\text{m})$
     2. $P_{\text{pick}} = (x_{\text{pick}}, y_{\text{pick}}, z_{\text{pick}})$
     3. Grasp Actuation (suction on, simulated 200ms delay)
     4. $P_{\text{lift}} = (x_{\text{pick}}, y_{\text{pick}}, z_{\text{pick}} + 0.10\text{m})$
     5. $P_{\text{tower\_approach}} = (x_{\text{tower}}, y_{\text{tower}}, z_k + 0.10\text{m})$
     6. $P_{\text{tower\_drop}} = (x_{\text{tower}}, y_{\text{tower}}, z_k)$
     7. Release Actuation (suction off, simulated 200ms delay)
     8. $P_{\text{tower\_retreat}} = (x_{\text{tower}}, y_{\text{tower}}, z_k + 0.10\text{m})$
     9. $P_{\text{home}} = \text{CANONICAL\_POSES["HOME"]}$
     10. Complete / Transition to `IDLE`.
3. **TDD Verification (`pytest`)**:
   - Forward kinematics round-trip verification asserting $< 1\text{mm}$ Cartesian positional accuracy.
   - Verification of $0.108\text{m}$ TCP offset.
   - Boundary rejection for $R < 0.20\text{m}$ and $R > 0.85\text{m}$.
   - Minimal angular distance branch selection avoiding large joint discontinuities.

---

## Step 3: EdgeNode Event-Driven WorkcellState & Autonomous Trajectory Execution (Unit 6.2)

Implement decoupled in-process event seam and background trajectory executor in EdgeNode.

1. **Decoupled `WorkcellState` & Event Emitter**:
   - Decouple workspace fixture inventory from robot controller logic via an internal pub/sub event mechanism.
   - On `PICK_AND_PLACE_TARGET`:
     - Reject if `robot_state != RobotState.IDLE`.
     - Calculate next vacant SpindleTower slot height: $z_k = k \times 0.02\text{m}$ (where $k = \text{number of placed gears} \pmod{10}$, default drop at $(0.40, -0.30, z_k)$ unless custom drop coordinate specified).
     - Emit in-process `WorkpieceSpawnedEvent(pick_coords, drop_coords)`.
2. **Autonomous Trajectory Execution Engine**:
   - `EdgeNode` subscribes to `WorkpieceSpawnedEvent`.
   - Transitions `RobotState`: `IDLE` $\to$ `PROCESSING` (during analytical IK computation).
   - Generates interpolated 30 Hz joint trajectory steps with velocity and acceleration limits.
   - Spawns background motion thread, transitions `RobotState` to `EXECUTING`.
   - Dispatches periodic joint updates at 30 Hz to telemetry stream.
   - Sets `palm_state.is_grasped = True` at $P_{\text{pick}}$, `False` at $P_{\text{tower\_drop}}$.
   - Upon arriving at $P_{\text{home}}$, records placed workpiece in `WorkcellState`, transitions `RobotState` back to `IDLE`.
3. **Safety Interlocks & Reset**:
   - `EMERGENCY_STOP` halts background motion thread immediately, purges pending queues, and transitions `RobotState` to `FAULT`.
   - `RESET_FAULT` clears fault and returns to `IDLE`.
   - `CLEAR_WORKSPACE` resets active workpiece and clears stacked tower inventory in `WorkcellState`.
4. **TDD Verification (`pytest`)**:
   - Event publication upon command arrival and next vacant slot calculation.
   - Lifecycle state transitions (`IDLE` $\to$ `PROCESSING` $\to$ `EXECUTING` $\to$ `IDLE`).
   - Telemetry stream assertions with `palm_state` toggling.
   - Emergency stop motion abortion and queue purge.
   - Workspace reset on `CLEAR_WORKSPACE`.

---

## Step 4: Gateway Stateless Schema Validation & Command Routing (Unit 6.3)

Validate `PICK_AND_PLACE_TARGET` frames at the WebSocket ingress boundary and route to DataFabric.

1. **Stateless Schema Validation**:
   - In `src/gateway/src/ws.rs`, deserialize and validate incoming `PICK_AND_PLACE_TARGET` frames against JSON schema.
   - Enforce 20 Hz command rate limit and active session exclusivity.
   - Forward valid command frames to Zenoh topic `robot/{id}/command`.
   - Return structured `ErrorFrame` (`INVALID_COMMAND_PAYLOAD`) over WebSocket for out-of-spec payloads without closing the WebSocket connection.
2. **TDD Verification (`cargo nextest`)**:
   - Assert valid `PICK_AND_PLACE_TARGET` forwarded to Zenoh.
   - Assert malformed or missing coordinate payloads return structured `ErrorFrame`.
   - Assert connection persistence across validation errors.

---

## Step 5: TeleopClient SpindleTower 3D Fixture, KinematicLinkAttachment & Tower Stacking (Unit 6.4)

Mount physical destination fixture in Three.js and manage deterministic gear parenting and tower inventory.

1. **3D SpindleTower Fixture**:
   - In `RobotVisualizer.tsx`, mount procedural SpindleTower fixture at $(x = 0.40\text{m}, y = -0.30\text{m}, z = 0.0\text{m})$ inside `robotGroup`.
   - Renders circular aluminum base flange ($r = 0.045\text{m}, h = 0.005\text{m}$) and vertical metal spindle post ($r = 0.007\text{m}, h = 0.20\text{m}$).
2. **Deterministic KinematicLinkAttachment Seam**:
   - When telemetry indicates `palm_state.is_grasped == true` and suction tip is within $15\text{mm}$ proximity of gear mesh, parent gear mesh to UR5e tool flange `tool0`.
   - Gear moves synchronously with manipulator during transfer.
   - When telemetry indicates `palm_state.is_grasped == false`, unparent gear mesh from `tool0` and snap stably to tower drop position $(x_{\text{tower}}, y_{\text{tower}}, z_k)$.
3. **Visual FIFO Bottom-Drop Tower Stacking**:
   - Accommodate up to 10 visual gears ($h_{\text{gear}} = 0.02\text{m}$).
   - Successive gears stack with $0.02\text{m}$ vertical increments ($z_k = k \times 0.02\text{m}$).
   - On 11th gear arrival, despawn oldest bottom gear and shift remaining stacked gears down by $0.02\text{m}$ (FIFO shift) so new gear lands at $z = 0.18\text{m}$.
4. **Table Click Dispatch & ClickLockout Integration**:
   - On reachable table click within $[0.35, 0.75]\text{m}$, spawn visual gear mesh and dispatch `PICK_AND_PLACE_TARGET` command with $(x, y, 0.0)$.
   - Engage `ClickLockout` until `robot_state` returns to `IDLE`.
   - "Clear Workspace" button destroys table gear and all stacked tower meshes, resetting lockout.
5. **TDD Verification (`vitest`)**:
   - Assert SpindleTower mesh hierarchy and coordinates.
   - Assert `KinematicLinkAttachment` parenting on grasp and unparenting on release.
   - Assert vertical stacking offset ($z_k = k \times 0.02\text{m}$) and FIFO bottom-drop shift on 11th gear.
   - Assert click lockout engaged during motion and lifted when `IDLE`.
   - Assert "Clear Workspace" cleans both table and tower meshes.

---

## Step 6: Multi-Service Closed-Loop System Integration Suite (Unit 6.5)

Verify complete end-to-end autonomous closed-loop operation across all three tiers using automated Playwright suite.

1. **End-to-End Autonomous Loop**:
   - Start EdgeNode, Gateway, and TeleopClient in headless test harness.
   - Simulate operator clicking valid table coordinate $(0.50, 0.0)$.
   - Assert gear spawns in visualizer, `PICK_AND_PLACE_TARGET` dispatches to Gateway $\to$ Zenoh $\to$ EdgeNode.
   - Assert `RobotState` transitions `IDLE` $\to$ `PROCESSING` $\to$ `EXECUTING`.
   - Assert manipulator executes waypoints, descends to pick, grasps gear, lifts, transfers to SpindleTower, deposits gear at $(0.40, -0.30, 0.0)$, and returns to `HOME`.
   - Assert `RobotState` transitions back to `IDLE` and `ClickLockout` lifts.
   - Simulate second table click at $(0.55, 0.10)$; assert second gear is picked and stacked at $z = 0.02\text{m}$ on SpindleTower.
   - Assert latency across WebSocket and DataFabric remains within $< 50\text{ms}$ budget.
   - Click "Clear Workspace"; assert scene resets cleanly across all tiers.
