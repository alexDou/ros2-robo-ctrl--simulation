> [!IMPORTANT]
> Aligns with [units.md](../units.md#unit-5-interactive-3d-workcell--click-to-place-gear-ingestion) and [ADR 0002](../../docs/adr/0002-in-process-workcell-state-isolation.md). In this unit, we establish the interactive 3D table workcell in Three.js, raycast placement with reachability boundary clamping ($0.35\text{m} \le R \le 0.75\text{m}$), single-gear placement lockout, wire schemas for `SPAWN_OBJECT` and `CLEAR_WORKSPACE`, and in-process `WorkcellState` tracking in EdgeNode.

Welcome to Unit 5: Interactive 3D Workcell & Click-to-Place Gear Ingestion. This unit provides the physical workspace interaction layer enabling operators to place gearwheels into the simulation and synchronizing workpiece state across all three tiers before autonomous pick-and-place execution (Unit 6).

------------------------------
## Contract-First Parallel Execution Model

Development strictly follows interface boundaries. Once wire schemas are locked in Unit 5.0, the 3D Workcell Table and Raycaster (Unit 5.1), EdgeNode `WorkcellState` (Unit 5.2), Gateway validation (Unit 5.3), and TeleopClient toolbar controls (Unit 5.4) execute concurrently against mocked interface seams. Only the final multi-service system integration suite (Unit 5.5) depends on all components.

```
                    ┌────────────────────────────────────────────────────────┐
                    │ Unit 5.0: Domain Schemas & Spawning Contracts (Stage 0)│
                    │ (Wire schemas, scripts/generate_domain.py, tests)      │
                    └───────────────────────────┬────────────────────────────┘
                                                │
         ┌──────────────────────┬───────────────┴───────────────┬──────────────────────┐
         │                      │                               │                      │
         ▼                      ▼                               ▼                      ▼
┌─────────────────┐   ┌─────────────────────────────┐   ┌────────────────┐   ┌───────────────────┐
│ Unit 5.1: Web   │   │ Unit 5.2: EdgeNode          │   │ Unit 5.3: GW   │   │ Unit 5.4: Web     │
│ 3D Table & Ray  │   │ WorkcellState & Lockout     │   │ Schema Validate│   │ Clear Button      │
│ (Visualizer seam│   │ (Tested vs mock ROS2/Zenoh) │   │ (Cargo nextest)│   │ (Vitest component)│
└────────┬────────┘   └──────────────┬──────────────┘   └───────┬────────┘   └─────────┬─────────┘
         │                           │                          │                      │
         └───────────────────────────┴──────────┬───────────────┴──────────────────────┘
                                                │
                                                ▼
                    ┌────────────────────────────────────────────────────────┐
                    │ Unit 5.5: Multi-Service System Integration Suite (Final│
                    │ (Live integration: Web + GW + EdgeNode + WorkcellState)│
                    └───────────────────────────┬────────────────────────────┘
```

---

## Step 1: Domain Schemas & Spawning Contracts (Unit 5.0)

Lock down serialization schemas across Rust, Python, and TypeScript before implementing node logic.

1. **Wire Schemas Update**:
   - `schemas/robot_command.schema.json`:
     - Add `SPAWN_OBJECT` to `CommandType` enum with payload:
       ```json
       {
         "type": "object",
         "title": "SpawnObjectPayload",
         "required": ["x", "y", "z", "object_type"],
         "properties": {
           "x": { "type": "number", "description": "Cartesian X in meters (REP-103 robot base frame)" },
           "y": { "type": "number", "description": "Cartesian Y in meters (REP-103 robot base frame)" },
           "z": { "type": "number", "description": "Cartesian Z in meters (clamped to table surface 0.0m)" },
           "object_type": { "type": "string", "enum": ["GEAR"], "description": "Type of object to spawn" }
         },
         "additionalProperties": false
       }
       ```
     - Add `CLEAR_WORKSPACE` to `CommandType` enum with payload:
       ```json
       {
         "type": "object",
         "title": "ClearWorkspacePayload",
         "properties": {},
         "additionalProperties": false
       }
       ```
2. **Code Generation**:
   - Run `python scripts/generate_domain.py` to regenerate:
     - `src/domain/domain.py` (Pydantic models)
     - `src/domain/domain.rs` (Serde models)
     - `web/domain/contracts.ts` (Zod schemas & TypeScript types)
3. **Cross-Language TDD Contract Tests**:
   - Python: `pytest tests/test_domain_contracts.py`
   - Rust: `cargo nextest run -p gateway --test domain_contract_test`
   - Web: `npm --prefix web run test`

---

## Step 2: 3D Workcell Table, Raycaster & Procedural Gear (Unit 5.1)

Render physical table platform and implement interactive click-to-place raycasting in Three.js.

1. **Interactive Table Platform**:
   - In `RobotVisualizer.tsx`, mount a rectangular table slab ($0.8\text{m} \times 0.6\text{m}$) inside `robotGroup` (preserving REP-103: $+X$ forward, $+Y$ left, $+Z$ up).
   - Centered at $+X \in [0.25, 0.85]\text{m}, Y \in [-0.3, 0.3]\text{m}$ with top surface flush at $Z = 0.0\text{m}$.
   - Open flanks left/right at $Z = 0.0\text{m}$ for future conveyor belt (Unit 8).
2. **Raycast Reticle Projector**:
   - Pointer move over table evaluates base distance $R_{xy} = \sqrt{x^2 + y^2}$.
   - If $0.35\text{m} \le R_{xy} \le 0.75\text{m}$ and not locked out: render glowing ring reticle on table surface at $(x, y, 0.0)$.
   - If out of reach, invalid, or locked out: hide reticle.
3. **Procedural Gearwheel Mesh**:
   - On valid table click, instantiate procedural gear mesh (cylinder with perimeter teeth, $r = 40\text{mm}, h = 20\text{mm}$) resting at $(x, y, 0.0)$.
   - Enforce client-side `ClickLockout` (disable further clicks while gear present).
   - Trigger `onSpawnObject({ x, y, z: 0.0, object_type: 'GEAR' })`.
4. **TDD Verification (`vitest`)**:
   - Assert raycast coordinate calculation in REP-103 frame.
   - Assert reticle visibility within $[0.35, 0.75]\text{m}$ and hiding outside.
   - Assert click lockout state transitions on spawn.

---

## Step 3: EdgeNode WorkcellState & Lockout Enforcement (Unit 5.2)

Implement authoritative workpiece state tracking and command gating inside EdgeNode.

1. **`WorkcellState` Component**:
   - Tracks `active_gear: Optional[Dict[str, Any]] = None`.
   - On `SPAWN_OBJECT`:
     - If `robot_state != RobotState.IDLE`: reject with warning / error.
     - If `active_gear is not None`: reject with duplicate spawn error.
     - Otherwise store active gear `{ x, y, z, object_type }`, acknowledge command.
   - On `CLEAR_WORKSPACE`:
     - If `robot_state != RobotState.IDLE`: reject with error.
     - Otherwise set `active_gear = None`, acknowledge command.
2. **TDD Verification (`pytest`)**:
   - Assert `SPAWN_OBJECT` records gear coordinates when `IDLE`.
   - Assert duplicate `SPAWN_OBJECT` rejected.
   - Assert `CLEAR_WORKSPACE` resets active gear.

---

## Step 4: Gateway Stateless Schema Validation (Unit 5.3)

Validate `SPAWN_OBJECT` and `CLEAR_WORKSPACE` frames at the WebSocket boundary.

1. **Gateway Validation**:
   - In `src/gateway/src/ws.rs`, deserialize and validate `SPAWN_OBJECT` and `CLEAR_WORKSPACE`.
   - Forward valid commands to Zenoh `robot/{id}/command`.
   - Return structured `ErrorFrame` on schema violations without closing connection.
2. **TDD Verification (`cargo nextest`)**:
   - Assert valid commands forwarded to Zenoh.
   - Assert malformed payloads return `ErrorFrame`.

---

## Step 5: TeleopClient Operator Toolbar Clear Workspace (Unit 5.4)

Provide operator controls for resetting workcell state.

1. **OperatorToolbar Integration**:
   - Add "Clear Workspace" button in `OperatorToolbar.tsx`.
   - Enabled only when `isIdle && hasActiveGear`.
   - Dispatches `CLEAR_WORKSPACE` command via WebSocket, destroys 3D gear mesh, and resets lockout.
2. **TDD Verification (`vitest`)**:
   - Assert "Clear Workspace" disabled when no gear or arm busy.
   - Assert clicking dispatches command and resets UI state.

---

## Step 6: Multi-Service Integration Suite (Unit 5.5)

End-to-end multi-service automated integration test (Playwright).

1. **Full Integration Loop**:
   - Start Gateway, EdgeNode, and TeleopClient.
   - Click table at valid reachable coordinate $(0.5, 0.0)$.
   - Assert gear spawns in Three.js scene, `SPAWN_OBJECT` arrives at EdgeNode, and further clicks are locked out.
   - Click "Clear Workspace".
   - Assert gear mesh destroyed, EdgeNode resets `WorkcellState`, and table click is re-enabled.
