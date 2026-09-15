---
# hand-sim-7w33
title: 'Unit 5: Interactive 3D Workcell & Click-to-Place Gear Ingestion'
status: todo
type: epic
tags:
  - ready-for-agent
created_at: 2026-09-15T22:17:30Z
updated_at: 2026-09-15T22:17:30Z
---

## Problem Statement

Operators observing the robotics simulation lack an interactive workcell environment to introduce physical workpieces for manipulation. Currently, the manipulator operates in an empty scene without spatial table constraints, raycast targeting, or workpiece ingestion mechanisms. Downstream autonomous pick-and-place manipulation (Unit 6) requires verified target workpiece coordinates and state synchronization across the browser visualizer, gateway, and edge robotics controller without introducing redundant microservice processes or unstable physics engine contact dynamics.

## Solution

Build an interactive 3D table workcell in the browser visualizer where operators can click to place gearwheel workpieces directly on the table surface. Target coordinates are computed via raycasting, validated against manipulator reachability boundaries ($0.35\text{m} \le R \le 0.75\text{m}$), and visually guided by a dynamic projector reticle. Clicking a valid point instantiates a procedural gearwheel mesh and dispatches a typed `SPAWN_OBJECT` wire command through the gateway to an isolated, in-process `WorkcellState` tracker in the edge node. Client-side and server-side click lockouts prevent multiple simultaneous workpieces, while a dedicated "Clear Workspace" button dispatches a `CLEAR_WORKSPACE` command to reset the scene and lift lockouts.

## User Stories

1. As an operator, I want to see a physical WorkcellTable in the 3D RobotVisualizer, so that I have a clear spatial reference for placing workpieces.
2. As an operator, I want the WorkcellTable to be positioned in front of the robotic manipulator at mounting level, so that placement coordinates are within reach and unobstructed by other mechanisms.
3. As an operator, I want the table flanks to remain open and unobstructed, so that future conveyor feed systems can enter the workcell seamlessly.
4. As an operator, I want to see a visual ring reticle projected onto the table surface following my cursor, so that I can preview where a gearwheel will be placed before clicking.
5. As an operator, I want the ring reticle to render in a visible, light accent shade when hovering within the ReachabilityBoundary, so that I know the target point is physically reachable by the manipulator.
6. As an operator, I want the ring reticle to automatically hide when hovering outside the ReachabilityBoundary, so that I cannot inadvertently target unreachable coordinates.
7. As an operator, I want the ring reticle to automatically hide when hovering outside the WorkcellTable boundaries, so that I do not place objects in empty 3D space.
8. As an operator, I want clicking within the ReachabilityBoundary to instantiate a procedural Gearwheel mesh resting directly on the WorkcellTable, so that I have visual confirmation of workpiece ingestion.
9. As an operator, I want the Gearwheel to instantly snap to the clicked table surface coordinates without physics engine jitter, so that placement is deterministic and lightweight.
10. As an operator, I want placing a Gearwheel to immediately dispatch a SPAWN_OBJECT RobotCommand across the network, so that downstream controllers are synchronized with the workspace state.
11. As an operator, I want SPAWN_OBJECT to carry exact Cartesian coordinates in the robot base frame, so that downstream kinematics solvers can plan trajectories directly.
12. As an operator, I want placing a Gearwheel to activate ClickLockout in TeleopClient, so that I cannot spawn multiple overlapping or unhandled workpieces.
13. As an operator, I want table clicks to be ignored or blocked whenever ClickLockout is active, so that the simulation preserves single-workpiece operational guarantees.
14. As an operator, I want table clicks to be disabled whenever RobotState is not IDLE, so that workpiece ingestion respects SingleCommandGating.
15. As an operator, I want a "Clear Workspace" button in the OperatorToolbar, so that I can manually reset the workcell and remove unneeded workpieces.
16. As an operator, I want the "Clear Workspace" button to be disabled when no Gearwheel is present, so that redundant commands are prevented.
17. As an operator, I want the "Clear Workspace" button to be disabled whenever RobotState is not IDLE, so that workspace resets do not interrupt active robot operations.
18. As an operator, I want clicking "Clear Workspace" to dispatch a CLEAR_WORKSPACE RobotCommand, so that EdgeNode resets its internal WorkcellState.
19. As an operator, I want clicking "Clear Workspace" to destroy the 3D Gearwheel mesh and lift ClickLockout, so that I can place a new workpiece on the table.
20. As a simulation engineer, I want EdgeNode to maintain an isolated in-process WorkcellState, so that workpiece occupancy and coordinates are authoritatively tracked without requiring a 4th microservice process.
21. As a simulation engineer, I want EdgeNode to reject SPAWN_OBJECT if a workpiece is already active or RobotState is not IDLE, so that server-side integrity is guaranteed even if client UI checks are bypassed.
22. As a backend developer, I want Gateway to perform stateless JSON schema validation on SPAWN_OBJECT and CLEAR_WORKSPACE frames, so that malformed requests are rejected with structured ErrorFrames before reaching DataFabric.
23. As a developer, I want domain models across Python, Rust, and TypeScript to be generated from single-source-of-truth JSON schemas, so that wire contracts are strictly synchronized.

## Implementation Decisions

- **Domain Schemas & Wire Contracts**:
  - `SPAWN_OBJECT` added to `CommandType` with typed payload:
    ```json
    {
      "type": "object",
      "title": "SpawnObjectPayload",
      "required": ["x", "y", "z", "object_type"],
      "properties": {
        "x": { "type": "number" },
        "y": { "type": "number" },
        "z": { "type": "number" },
        "object_type": { "type": "string", "enum": ["GEAR"] }
      },
      "additionalProperties": false
    }
    ```
  - `CLEAR_WORKSPACE` added to `CommandType` with typed empty payload `{}`.
  - Payloads kept strictly minimal for Unit 5 objectives per Ponytail discipline (deferring color/defect properties to Unit 7).
- **Architectural Seam: In-Process WorkcellState over Dedicated Process (ADR-0002)**:
  - Rather than spawning an external `SpawnNode` microservice process, `EdgeNode` hosts an internal `WorkcellState` domain component.
  - `WorkcellState` tracks active workpiece coordinates, presence, and occupancy.
  - Enforces `SingleCommandGating` and single-workpiece placement lockouts server-side.
  - Retains exactly 3 core tiers across deployment, local dev, CI, and test harnesses.
- **Gateway Stateless Validation**:
  - `Gateway` acts as a pure protocol and schema bridge without maintaining kinematics or spatial models.
  - Validates JSON schemas for `SPAWN_OBJECT` and `CLEAR_WORKSPACE`.
  - Forwards valid frames to `DataFabric` (`robot/{id}/command`) and returns structured `ErrorFrame` on schema violations.
- **Workcell Spatial Layout**:
  - `WorkcellTable` mounted inside `robotGroup` in `RobotVisualizer` preserving REP-103 frame conventions (+X forward, +Y left, +Z up).
  - Rectangular table slab ($0.8\text{m} \times 0.6\text{m}$) positioned in front of the robot ($+X \in [0.25, 0.85]\text{m}, Y \in [-0.3, 0.3]\text{m}$) with top surface flush at $Z = 0.0\text{m}$.
  - Flanks remain open for future conveyor belt feed integration.
- **Raycast Targeting & Visualizer Interaction**:
  - Dynamic ring reticle projected onto the table surface. Visible with a lighter accent highlight when within $0.35\text{m} \le \sqrt{x^2 + y^2} \le 0.75\text{m}$ and `robot_state === 'IDLE'`; hidden when out of reach, outside table boundaries, or when locked out.
  - On valid click, procedural `Gearwheel` mesh (cylinder with perimeter teeth, $r = 40\text{mm}, h = 20\text{mm}$) snaps instantly to $(x, y, 0.0)$ on the table surface.
  - Activates client-side `ClickLockout` until workspace cleared.
- **Operator Controls**:
  - `OperatorToolbar` adds a "Clear Workspace" button.
  - Button interlocked: enabled only when `robot_state === 'IDLE'` and an active gear is present.
  - Triggers `CLEAR_WORKSPACE` command, destroys 3D gear mesh, and resets lockout state.

## Testing Decisions

### What Makes a Good Test

Tests must verify externally observable behaviors and boundary contracts rather than internal private variables:
- Assert wire frames match serialized schemas across Python, Rust, and TypeScript.
- Assert service boundaries reject invalid inputs with structured error frames without crashing or dropping WebSocket sessions.
- Assert UI raycasting correctly transforms pointer coordinates to robot base frame coordinates.
- Assert user interaction flows end-to-end (click table $\to$ gear renders $\to$ command emitted $\to$ lockout active $\to$ clear button resets scene).

### Primary Testing Seams

1. **Multi-Service Integration Seam (Highest Seam)**:
   - Automated end-to-end integration suite (Playwright / Cucumber) orchestrating `TeleopClient`, `Gateway`, and `EdgeNode`.
   - Simulates operator clicking valid table coordinate $\to$ asserts `SPAWN_OBJECT` frame arrives at `EdgeNode`, `Gearwheel` renders in 3D scene, and further clicks are locked out.
   - Simulates operator clicking "Clear Workspace" $\to$ asserts `CLEAR_WORKSPACE` arrives at `EdgeNode`, gear disappears, and clicks are re-enabled.
2. **Cross-Language Domain Contract Seams**:
   - Python (`pytest`), Rust (`cargo nextest`), and TypeScript (`vitest`) asserting bidirectional JSON serialization of `SPAWN_OBJECT` and `CLEAR_WORKSPACE`.
3. **Gateway Boundary Seam**:
   - `cargo nextest` verifying schema validation and error frame generation for out-of-spec payloads.
4. **EdgeNode WorkcellState Seam**:
   - `pytest` asserting `WorkcellState` stores gear coordinates, rejects duplicate spawns or non-IDLE spawns, and clears on `CLEAR_WORKSPACE`.
5. **TeleopClient Component Seam**:
   - `vitest` asserting `WorkcellTable` rendering, reticle visibility within $[0.35, 0.75]\text{m}$, click lockout transitions, and toolbar clear button dispatch.

### Prior Art

- `src/gateway/tests/ws_gateway_test.rs`: Testing WebSocket frame validation, error frames, and DataFabric forwarding.
- `src/gateway/tests/domain_contract_test.rs`: Testing Rust domain model serialization and validation.
- `tests/test_domain_contracts.py`: Testing Python domain model serialization.
- `web/tests/unit/RobotVisualizer.test.tsx`: Three.js scene mounting, coordinate frames, and lifecycle tests.
- `web/tests/unit/OperatorToolbar.test.tsx`: Button rendering and state interlock tests.
- `web/tests/e2e/steps/`: Multi-service integration step definitions using Playwright.

## Out of Scope

- Live Gazebo physics simulation or physical contact friction (deferred per ADR-0001).
- Autonomous trajectory execution, inverse kinematics (IK) calculation, or arm motion (reserved for Unit 6).
- Vision defect inspection, ONNX runtime classification, or gear coloring (reserved for Unit 7).
- Indexing conveyor belt feed mechanism (reserved for Unit 8).
- Multiple simultaneous workpieces (strictly bounded to single-gear lockout in Unit 5).

## Further Notes

- Aligns directly with [ADR 0002](docs/adr/0002-in-process-workcell-state-isolation.md) avoiding redundant microservice processes.
- Respects `SingleCommandGating` and canonical terminology defined in [CONTEXT.md](CONTEXT.md).
- Sets up clean target coordinates for Unit 6 analytical inverse kinematics waypoint generation.
