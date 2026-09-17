---
# hand-sim-d20p
title: 'Unit 6: Autonomous Pick-and-Place to Common Destination'
status: todo
type: epic
tags:
    - ready-for-agent
created_at: 2026-09-16T17:13:29Z
updated_at: 2026-09-16T17:13:29Z
---

## Problem Statement

Operators observing the robotics simulation lack autonomous manipulation capabilities. In Unit 5, workpieces can be ingested onto the WorkcellTable, but the robotic manipulator remains static in its home pose. There is no automated pick-and-place manipulation, no analytical inverse kinematics solver, no trajectory execution to transfer workpieces, and no destination receptacle for placed parts. Operators evaluating automated robotic material handling cannot observe the robot physically reach, grasp, transfer, and stack workpieces. Downstream automated sorting (Unit 7) requires a verified closed-loop pick-and-place pipeline with deterministic grasping, collision-free waypoint sequencing, and tower inventory management.

## Solution

Achieve closed-loop autonomous pick-and-place manipulation from table landing coordinates to a dedicated SpindleTower destination. When an operator clicks a valid table point within the ReachabilityBoundary, TeleopClient dispatches a typed `PICK_AND_PLACE_TARGET` RobotCommand across the Gateway to EdgeNode. An in-process WorkcellState tracker registers the workpiece and calculates the next vacant SpindleTower slot, publishing an in-process domain event. EdgeNode's closed-form AnalyticalInverseKinematics solver computes joint trajectories for a deterministic 10-step PickAndPlaceSequence with downward tool orientation, explicit Tool Center Point (TCP) offset, and minimal angular displacement. EdgeNode executes smooth joint trajectories at 30 Hz and toggles DexterousPalm grasp states while streaming live telemetry. In the 3D visualizer, KinematicLinkAttachment deterministically parents the gear mesh to the tool flange during grasp and deposits it onto the SpindleTower post upon arrival. The SpindleTower visually accommodates up to 10 stacked gears, automatically cycling via a FIFO bottom-drop shift on overflow. Returning to the canonical HOME posture transitions RobotState back to IDLE, automatically lifting ClickLockout to allow continuous operation.

## User Stories

1. As an operator, I want clicking a valid point on the WorkcellTable to dispatch a PICK_AND_PLACE_TARGET command, so that the robotic manipulator autonomously initiates pick-and-place execution.
2. As an operator, I want the PICK_AND_PLACE_TARGET command to carry exact pick coordinates (x, y, z), so that EdgeNode knows precisely where to pick the gear.
3. As an operator, I want the PICK_AND_PLACE_TARGET command to optionally accept custom drop coordinates, so that programmatic callers can override the default drop destination.
4. As an operator, I want the robotic manipulator to transition from IDLE to PROCESSING when solving inverse kinematics, so that I can observe when motion planning is underway.
5. As an operator, I want the robotic manipulator to transition from PROCESSING to EXECUTING when moving, so that I know active motion is in progress.
6. As an operator, I want the arm to execute a smooth approach trajectory to 10cm above the gear, so that it does not collide with the table or workpiece during transit.
7. As an operator, I want the arm to descend vertically from approach to the pick coordinate, so that the DexterousPalm aligns squarely with the top surface of the gear.
8. As an operator, I want the DexterousPalm to actuate to GRASP once at the pick coordinate, so that suction engagement is simulated before lifting.
9. As an operator, I want a 200ms simulated pneumatic delay during grasp actuation, so that physical suction building is realistically reflected in the telemetry stream.
10. As an operator, I want the 3D visualizer to deterministically attach the Gearwheel mesh to the tool flange when grasped within 15mm proximity, so that the gear moves synchronously with the manipulator.
11. As an operator, I want the arm to lift vertically to 10cm clearance above the table after grasping, so that the workpiece clears adjacent obstacles and table fixtures.
12. As an operator, I want the arm to transfer smoothly from the lift waypoint to a clearance waypoint directly above the SpindleTower, so that it avoids swinging low across the workspace.
13. As an operator, I want the arm to descend vertically onto the SpindleTower at the exact calculated stack height, so that the gear lands cleanly on the spindle pin or existing stack.
14. As an operator, I want the DexterousPalm to actuate to RELEASE once at the drop coordinate, so that suction disengages and the gear is deposited.
15. As an operator, I want the 3D visualizer to unparent the Gearwheel from the tool flange on release, so that the gear rests stably on the SpindleTower at the target stack height.
16. As an operator, I want the arm to retreat vertically to clearance height above the tower after releasing, so that the nozzle does not clip the placed gear.
17. As an operator, I want the arm to return to its canonical HOME posture after completing the drop sequence, so that the workspace is left in a safe, predictable resting pose.
18. As an operator, I want EdgeNode to transition RobotState back to IDLE upon reaching HOME, so that operator controls and placement reticles are re-enabled.
19. As an operator, I want ClickLockout to lift automatically when the robot returns to IDLE, so that I can immediately place another gear without manual intervention.
20. As an operator, I want to see a physical SpindleTower fixture mounted on the WorkcellTable, so that I have a clear visual destination for sorted workpieces.
21. As an operator, I want the SpindleTower to feature a vertical metal post with base flange, so that gears visibly slide over the post during stacking.
22. As an operator, I want the SpindleTower to visually accommodate up to 10 stacked gears, so that multiple pick-and-place cycles can be observed without immediate clutter.
23. As an operator, I want each successive gear to stack exactly on top of previous gears with 2cm vertical increments, so that the physical stack height accurately reflects gear thickness.
24. As an operator, I want placing an 11th gear when the tower is full to despawn the oldest bottom gear and shift the stack down by one gear height, so that the tower operates as a continuous FIFO buffer without artificial limits.
25. As an operator, I want clicking "Clear Workspace" to remove all gears from both the table and the SpindleTower, so that I can reset the entire workspace to its pristine initial state.
26. As an operator, I want EmergencyStop to immediately abort active pick-and-place motion, purge the motion thread, and transition RobotState to FAULT, so that safety hazards are contained.
27. As a robotics engineer, I want EdgeNode to calculate inverse kinematics using an analytical closed-form solver in pure Python, so that motion planning executes in sub-millisecond time without external MoveIt2 dependencies.
28. As a robotics engineer, I want the analytical solver to enforce a vertical downward suction cup orientation, so that the DexterousPalm always approaches workpieces normally to the table.
29. As a robotics engineer, I want the analytical solver to incorporate the exact 108mm tool center point (TCP) offset, so that coordinates target the suction cup tip rather than the bare wrist flange.
30. As a robotics engineer, I want the analytical solver to select the kinematic solution with minimal Euclidean angular displacement from current joint positions, so that the manipulator moves smoothly without erratic multi-revolution flips.
31. As a robotics engineer, I want WorkcellState to remain decoupled from EdgeNode kinematics via an in-process pub/sub event mechanism, so that workspace inventory tracking has zero coupling to robot motion controllers.
32. As a backend engineer, I want Gateway to validate PICK_AND_PLACE_TARGET frames statelessly against JSON schemas, so that malformed requests are rejected with structured ErrorFrames.

## Implementation Decisions

- **Domain Schemas & Wire Contracts**:
  - `PICK_AND_PLACE_TARGET` added to `CommandType` enum in `schemas/robot_command.schema.json` with typed payload:
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
  - Cross-language domain bindings regenerated across Python, Rust, and TypeScript via `scripts/generate_domain.py`.
- **In-Process Pub/Sub Seam (ADR-0002 & ADR-0003)**:
  - `WorkcellState` remains completely decoupled from kinematics and manipulator nodes.
  - Implements an internal publisher-subscriber interface. When a target is ingested, `WorkcellState` calculates next vacant tower slot $(x_{\text{tower}}, y_{\text{tower}}, z_k)$ and publishes `WorkpieceSpawnedEvent(pick_coords, drop_coords)`.
  - `EdgeNode` subscribes to `WorkpieceSpawnedEvent`, transitions to `PROCESSING`, solves analytical IK waypoints, and launches the execution thread.
- **Pure Python Analytical UR5e Inverse Kinematics (ADR-0003)**:
  - Implements closed-form geometric kinematics using canonical UR5e Denavit-Hartenberg parameters.
  - Enforces vertical downward suction cup orientation ($Z$-down tool normal).
  - Explicitly accounts for DexterousPalm Tool Center Point (TCP) offset: $L_{\text{tool}} = 0.108\text{m}$ (baseplate 18mm + extension rod 55mm + suction bellows 35mm).
  - Filters out unreachable poses outside operational boundaries ($R < 0.20\text{m}$ or $R > 0.85\text{m}$ or singularity regions).
  - Selects the optimal solution among valid branches in $[-\pi, \pi]$ having minimal Euclidean distance from current joint positions.
- **Deterministic 10-Step PickAndPlaceSequence**:
  - Waypoint execution path:
    1. $P_{\text{approach}} = (x_{\text{pick}}, y_{\text{pick}}, z_{\text{pick}} + 0.10\text{m})$
    2. $P_{\text{pick}} = (x_{\text{pick}}, y_{\text{pick}}, z_{\text{pick}})$
    3. Grasp actuation: `palm_state.is_grasped = True` (with 200ms delay)
    4. $P_{\text{lift}} = (x_{\text{pick}}, y_{\text{pick}}, z_{\text{pick}} + 0.10\text{m})$
    5. $P_{\text{tower\_approach}} = (x_{\text{tower}}, y_{\text{tower}}, z_k + 0.10\text{m})$
    6. $P_{\text{tower\_drop}} = (x_{\text{tower}}, y_{\text{tower}}, z_k)$
    7. Release actuation: `palm_state.is_grasped = False` (with 200ms delay)
    8. $P_{\text{tower\_retreat}} = (x_{\text{tower}}, y_{\text{tower}}, z_k + 0.10\text{m})$
    9. $P_{\text{home}} = \text{CANONICAL\_POSES["HOME"]}$
    10. Complete: `robot_state = IDLE`, WorkcellState records placed gear, ClickLockout lifts.
- **SpindleTower Physical Fixture & FIFO Stacking**:
  - Mounted on the WorkcellTable at $(x = 0.40\text{m}, y = -0.30\text{m}, z = 0.0\text{m})$ consisting of an aluminum base flange and vertical metal spindle post ($r = 0.007\text{m}, h = 0.20\text{m}$).
  - Accommodates up to 10 visual gears ($h_{\text{gear}} = 0.02\text{m}$).
  - FIFO overflow: when an 11th gear arrives, the oldest bottom gear despawns, remaining gears shift down by $0.02\text{m}$, and the new gear lands at $z = 0.18\text{m}$.
  - `CLEAR_WORKSPACE` empties active gear and all stacked tower gears.
- **Deterministic KinematicLinkAttachment Seam**:
  - When `palm_state.is_grasped` is true and tool nozzle is within 15mm of gear center, gear mesh is parented to `tool0`.
  - When `palm_state.is_grasped` becomes false, gear mesh unparents and snaps stably to tower position $(x_{\text{tower}}, y_{\text{tower}}, z_k)$.

## Testing Decisions

### What Makes a Good Test

Tests must verify externally observable behaviors and boundary contracts rather than internal private variables:
- Assert wire frames match serialized schemas across Python, Rust, and TypeScript.
- Assert service boundaries reject out-of-bounds or malformed requests with structured error frames without dropping connections.
- Assert kinematics solver achieves sub-millimeter Cartesian accuracy ($<1\text{mm}$) when mapped forward through forward kinematics.
- Assert full end-to-end multi-service loop: click table $\to$ gear spawns $\to$ arm moves through waypoints $\to$ gear attaches $\to$ gear stacks on tower $\to$ arm returns to HOME $\to$ IDLE state restored.

### Primary Testing Seams

1. **Multi-Service Integration Seam (Highest Seam)**:
   - Automated end-to-end integration suite (Playwright / Cucumber) orchestrating `TeleopClient`, `Gateway`, and `EdgeNode`.
   - Simulates user table click $\to$ asserts `PICK_AND_PLACE_TARGET` dispatches $\to$ robot state transitions `IDLE` $\to$ `PROCESSING` $\to$ `EXECUTING` $\to$ `IDLE` $\to$ gear picked and stacked on SpindleTower.
   - Asserts ClickLockout re-enables subsequent placement after return to IDLE.
2. **Cross-Language Domain Contract Seams**:
   - Python (`pytest`), Rust (`cargo nextest`), and TypeScript (`vitest`) verifying JSON serialization and deserialization of `PICK_AND_PLACE_TARGET`.
3. **Analytical Inverse Kinematics Seam**:
   - Unit tests in `pytest` evaluating analytical IK solver: forward kinematics verification, TCP offset verification, singularity boundary rejection, and minimal Euclidean distance branch selection.
4. **WorkcellState Pub/Sub Seam**:
   - `pytest` asserting event publication upon target ingestion, next vacant slot calculation, FIFO bottom-drop overflow at $N>10$, and clear workspace reset.
5. **Gateway Boundary Seam**:
   - `cargo nextest` verifying schema validation for `PICK_AND_PLACE_TARGET` and error frame generation for out-of-spec payloads.
6. **TeleopClient Visualizer Component Seam**:
   - `vitest` asserting SpindleTower mounting, KinematicLinkAttachment parenting/unparenting lifecycle, FIFO stack shifting, and table click dispatch.

### Prior Art

- `tests/test_domain_contracts.py` & `src/gateway/tests/domain_contract_test.rs`: Domain schema serialization round-trip suites.
- `tests/test_edge_node.py`: EdgeNode lifecycle state machine and command handling.
- `src/gateway/tests/ws_gateway_test.rs`: Actix-Web WebSocket validation and frame routing.
- `web/tests/unit/RobotVisualizer.test.tsx`: Three.js scene mounting, coordinate mapping, and raycasting.
- `web/tests/e2e/steps/`: Multi-service Playwright integration suites.

## Out of Scope

- Rigid-body physics engine contact friction or unstable collision dynamics (deferred per ADR-0001).
- Multi-tower color classification, camera inference, or defect sorting (reserved for Unit 7).
- Conveyor belt tracking or continuous feed mechanisms (reserved for Unit 8).
- ROS2 MoveIt2 C++ action server dependencies (rejected per ADR-0003).

## Further Notes

- Adheres strictly to [ADR 0001](docs/adr/0001-defer-gazebo-to-phase4-mock-motion-visualizer.md), [ADR 0002](docs/adr/0002-in-process-workcell-state-isolation.md), and [ADR 0003](docs/adr/0003-analytical-ur5e-ik-and-event-driven-workcell.md).
- Employs canonical domain vocabulary from [CONTEXT.md](CONTEXT.md).
- Sets up physical SpindleTower destination geometry directly reusable in Unit 7.
