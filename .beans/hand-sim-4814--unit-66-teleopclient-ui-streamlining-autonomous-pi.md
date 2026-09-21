---
# hand-sim-4814
title: 'Unit 6.6: TeleopClient UI Streamlining & Autonomous Pick-and-Place Lifecycle Hardening'
status: todo
type: feature
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-20T09:41:27Z
updated_at: 2026-09-21T10:47:13Z
parent: hand-sim-d20p
---

## Problem Statement

Operators monitoring and controlling the robotics workcell encounter critical lifecycle desynchronization and interface friction during autonomous pick-and-place execution:

1. **Gearwheel Disappearance & Broken Stacking**: When an operator clicks the WorkcellTable to initiate pick-and-place, a Gearwheel mesh appears on the table surface. However, as soon as the manipulator begins motion (transitioning from IDLE to EXECUTING/APPROACHING), the Gearwheel immediately vanishes from the 3D visualizer table before the arm reaches it. Consequently, the DexterousPalm end-effector moves through the workspace empty-handed, and upon reaching the SpindleTower destination, no workpiece is deposited, causing the SpindleTower to never grow with stacked parts.
2. **Telemetry Stream Clobbering**: The root cause stems from the boundary service TelemetryThrottler synthesizing periodic high-rate joint state frames with hardcoded default states (`IDLE` and `is_grasped: false`). These synthetic frames overwrite the authoritative state emitted by the robotics EdgeNode, causing the browser client to observe an instantaneous state flicker (`EXECUTING` -> `IDLE`), which triggers premature gear cleanup and suppresses end-effector grasp detection.
3. **Cluttered & Inefficient Operator Toolbar**: The visualizer interface exposes redundant manual controls that detract from the autonomous workflow:
   - A prominent, hazardous "Emergency Stop" button occupies prime toolbar real estate despite Disconnect already fulfilling safe parking.
   - The Connect and Disconnect controls are displaced to the bottom of the page beneath the visualizer and event logs, requiring awkward scrolling.
   - Manual "Palm Control" toggle buttons (Grasp / Release) clutter the toolbar despite grasping being autonomously sequenced during pick-and-place.
   - Canned test postures ("Home", "Ready", "Inspect") clutter the toolbar when only a safe "Home" recovery action is necessary for autonomous operations.
   - The "Verify Connection (Ping)" diagnostic button was disabled or non-functional while disconnected, and disappeared abruptly once telemetry streaming began, preventing pre-flight connection verification.

## Solution

A hardened, synchronized autonomous pick-and-place pipeline and a streamlined, ergonomic OperatorToolbar in TeleopClient:

1. **Authoritative Telemetry Synchronization & Stable Workpiece Lifecycle**:
   - The Gateway TelemetryThrottler maintains state parity with the robotics EdgeNode, ensuring decimated joint state frames preserve the active `RobotState` and `PalmState` rather than clobbering them with default idle values.
   - TeleopClient guards workpiece lifecycle against transient state flickers: the active Gearwheel is preserved on the WorkcellTable throughout the approach and pick phases, parents deterministically to the tool flange upon grasp actuation via KinematicLinkAttachment, transfers synchronously across the workspace, deposits neatly onto the SpindleTower at successive vertical height steps ($z_k = k \times 0.02\text{m}$), and only resets placement lockouts when the manipulator safely returns to canonical HOME posture.
2. **Streamlined OperatorToolbar & Integrated Connection Toggle**:
   - The unused "Emergency Stop" button is removed from the OperatorToolbar.
   - In its place on the right flank of the toolbar, a dedicated single-button connection toggle is mounted: displaying an active "Connect" action when offline or in standby, and "Disconnect" when actively connected or activating. The awkward bottom-page connection buttons are eliminated.
   - The manual "Palm Control" button cluster is completely removed from the toolbar.
   - The poses cluster is streamlined to a single, focused "Home" button for manual posture reset, retiring redundant test poses ("Ready", "Inspect").
   - The "Verify Connection (Ping)" diagnostic control is fully operational while disconnected (performing a Gateway health check probe) and before streaming, then cleanly steps aside once continuous 30 Hz streaming is active.

## User Stories

1. As an operator, I want clicking a valid point on the WorkcellTable to spawn a visible Gearwheel workpiece, so that I can see the item ready for pickup.
2. As an operator, I want the Gearwheel workpiece to remain resting visibly on the WorkcellTable during the entire APPROACHING phase, so that it does not disappear when arm execution starts.
3. As an operator, I want the DexterousPalm end-effector to descend squarely onto the top surface of the placed Gearwheel, so that the physical grasping alignment is visually credible.
4. As an operator, I want the DexterousPalm visual indicator to illuminate when suction engages during the GRASPING phase, so that I have immediate visual feedback of actuation.
5. As an operator, I want the Gearwheel mesh to parent dynamically to the tool flange when grasped, so that the workpiece follows the manipulator's motion synchronously during LIFTING and TRANSFERRING.
6. As an operator, I want the manipulator to carry the Gearwheel over the WorkcellTable without dropping it prematurely, so that transfer to the SpindleTower is reliably depicted.
7. As an operator, I want the DexterousPalm to release the Gearwheel directly above the SpindleTower at the appropriate vertical stack height, so that parts accumulate cleanly.
8. As an operator, I want each successive placed gear to remain stacked on the SpindleTower pin at increments of 2cm, so that the SpindleTower visually grows with each completed pick-and-place cycle.
9. As an operator, I want the SpindleTower to retain all previously placed gears across multiple pick-and-place cycles, so that I can observe batch workpiece stacking.
10. As an operator, I want the manipulator to retreat vertically from the SpindleTower and return to its canonical HOME posture upon completing a drop, so that the workspace is left in a safe resting configuration.
11. As an operator, I want ClickLockout to lift automatically once the manipulator has safely returned to HOME and IDLE state, so that I can immediately initiate another pick-and-place cycle.
12. As an operator, I want clicking "Clear Workspace" to remove all gears from both the WorkcellTable and the SpindleTower, so that I can reset the scene to its initial clean state.
13. As an operator, I want a single prominent Connect/Disconnect toggle located in the right slot of the OperatorToolbar, so that connection lifecycle controls are immediately adjacent to robot controls without scrolling.
14. As an operator, I want the connection toggle to display "Connect" in bold blue when the visualizer is disconnected, so that it is obvious how to start a session.
15. As an operator, I want pressing "Connect" in the toolbar to initiate the Gateway WebSocket connection and trigger the ROS2 ENGAGE handshake, so that robot controllers activate smoothly.
16. As an operator, I want the connection toggle to display "Disconnect" in neutral slate when the visualizer is connected, so that I can easily terminate the session.
17. As an operator, I want pressing "Disconnect" to close the WebSocket session and trigger the ROS2 STANDBY teardown, so that controllers park safely with zero joint traffic.
18. As an operator, I want the redundant red "Emergency Stop" button removed from the toolbar, so that accidental halts are minimized since Disconnect provides orderly parking.
19. As an operator, I want the manual "Palm Control" button cluster removed from the toolbar, so that the UI is not cluttered with controls superseded by autonomous actuation.
20. As an operator, I want a single "Home" posture button in the toolbar, so that I have a clean manual mechanism to return the arm to its canonical resting posture without extraneous test poses.
21. As an operator, I want the redundant "Ready" and "Inspect" pose buttons removed from the toolbar, so that operator confusion between autonomous tasks and manual poses is eliminated.
22. As an operator, I want the "Verify Connection (Ping)" button to be fully functional when disconnected, probing Gateway responsiveness and logging status to the EventLog, so that I can verify backend availability before connecting.
23. As an operator, I want "Verify Connection (Ping)" to step aside and not clutter the DOM during active streaming, so that live teleoperation remains distraction-free.
24. As a robotics engineer, I want the Gateway TelemetryThrottler to preserve EdgeNode's authoritative RobotState, so that downsampled joint state frames do not falsely report IDLE while a trajectory is active.
25. As a robotics engineer, I want the Gateway TelemetryThrottler to preserve EdgeNode's authoritative PalmState, so that downsampled joint state frames accurately convey is_grasped status to the visualizer.
26. As a web developer, I want TeleopClient session state logic to ignore transient single-frame state fluctuations during action transitions, so that workpiece presence is not prematurely invalidated.

## Implementation Decisions

- **Gateway Telemetry State Tracking**:
  - The Gateway TelemetryThrottler will track the latest authoritative `RobotState` and `PalmState` received from the EdgeNode (or updated via action feedback events), rather than defaulting to static `Idle` and `is_grasped: false` during joint decimation.
  - When decimating high-rate joint states into 30 Hz telemetry frames, the throttler will inject the active lifecycle and palm states into the outgoing JSON payload.
- **TeleopClient Workpiece Lifecycle Guard**:
  - In `useTeleopSession`, active workpiece presence will not be invalidated simply by a transient `IDLE` telemetry frame. Workpiece clearance will only occur upon confirmed action completion, explicit `Clear Workspace` command, or tower deposit.
  - In `RobotVisualizer`, `clearActiveGear()` will only be triggered when the session explicitly indicates workspace reset, preventing automatic deletion while a pick-and-place action is underway.
- **KinematicLinkAttachment Synchronization**:
  - In `RobotVisualizer`, KinematicLinkAttachment will check both the live `palmState.is_grasped` telemetry buffer and active `actionProgress.phase` (`GRASPING`, `LIFTING`, `TRANSFERRING`, `DROPPING`) as a resilient double-check, ensuring the gear reliably parents to the `tool0` flange when the arm descends to the table.
  - Release actuation during the `RELEASING` phase or when `is_grasped` transitions to false will unparent the gear and deposit it onto the `SpindleTower` at height $z_k = k \times 0.02\text{m}$, updating the internal tower stack count.
- **OperatorToolbar Layout Restructuring**:
  - Remove `EMERGENCY STOP` button from `OperatorToolbar`.
  - Mount a single `Connect` / `Disconnect` toggle in the right slot previously occupied by Emergency Stop.
  - Remove separate bottom-of-page connection button container in `TeleopClient`.
  - Remove the entire `Palm Control` button cluster (`palm-control-cluster`) from `OperatorToolbar`.
  - Streamline the `Poses` cluster to retain only a single `Home` button (`onExecutePose('HOME')`), deleting `Ready` and `Inspect`.
  - Keep `Verify Connection (Ping)` fully functional when connected-but-not-streaming (Gateway health-check probe + EventLog), visible pre-stream (`!isStreaming`), removed from DOM during 30Hz streaming.

## Testing Decisions

- **What makes a good test**:
  - Tests must verify observable user-facing behavior and wire contract compliance without asserting internal variable names or private helper methods.
  - Tests assert visual and physical state transitions: clicking table spawns gear, gear remains present when action progress begins, gear attaches to flange upon grasp, gear deposits to SpindleTower on release, and SpindleTower stack count increments.
  - Tests assert that pressing Connect in the toolbar opens the WebSocket, transitions state, and turns into Disconnect; pressing Disconnect closes the socket and returns the button to Connect.
  - Tests assert Ping button present + functional pre-stream (logs event), removed from DOM during streaming.
- **Modules to be tested**:
  - `web/tests/unit/OperatorToolbar.test.tsx` (or `TeleopClient.test.tsx`): Verify toolbar rendering with Connect/Disconnect toggle, single Home pose button, absence of Palm controls and Emergency Stop, and continuous Ping availability.
  - `web/tests/unit/RobotVisualizer.test.tsx`: Verify gear retention during APPROACHING phase, flange attachment during GRASPING, and SpindleTower stack growth across successive pick-and-place cycles.
  - `src/gateway/tests/throttler_action_test.rs`: Verify that TelemetryThrottler joint state decimation preserves non-idle RobotState and active PalmState without reverting to default idle.
- **Prior Art**:
  - `web/tests/unit/TeleopClient.test.tsx` for component connection state machines and button mocking.
  - `web/tests/unit/RobotVisualizer.test.tsx` for Three.js scene hierarchy, raycasting, and KinematicLinkAttachment testing.
  - `src/gateway/tests/throttler_action_test.rs` for Gateway throttler decimation verification.

## Out of Scope

- Multi-color vision defect inspection and sorting into multiple colored towers (deferred to Unit 7).
- Continuous indexing conveyor belt integration (deferred to Unit 8).
- Additional physical hardware interlocks beyond the software Disconnect / STANDBY park cycle.

## Further Notes

- Retaining a single "Home" button in the toolbar preserves manual recovery without cluttering the interface with redundant test poses.
- Removing Emergency Stop aligns with the operator's mental model where Disconnect safely closes the session and gracefully parks the arm in STANDBY.

## Branch map (6.6.0-6.6.5, parent-body convention: task cannot formally parent task)

- hand-sim-jqtr (6.6.0, completed, e80962b): PROCESSING dropped, 5-state contract live
- hand-sim-5ije (6.6.1, todo, blocked by jqtr): gateway preserves EXECUTING + is_grasped
- hand-sim-3q1f (6.6.2, todo, blocked by 5ije): workpiece survives until grasp
- hand-sim-he7j (6.6.3, todo, blocked by 3q1f): grasp attach + tower growth
- hand-sim-92ew (6.6.4a, todo, blocked by jqtr): toolbar cleanup (E-STOP/palm/Ready-Inspect gone)
- hand-sim-dnv4 (6.6.4b, todo, blocked by jqtr): ping health probe
- hand-sim-rr7s (6.6.5, todo, blocked by he7j+92ew+dnv4): E2E wire-up, 2-cycle stack green

Verdict 2026-09-21: implementation NEEDED (OperatorToolbar.tsx still ships E-STOP/Ready/Inspect/palm cluster). Stays todo.
