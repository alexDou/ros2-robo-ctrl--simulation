### Dexterous Palm Integration & Actuation Foundation
> [!NOTE] HISTORICAL-SUPERSEDED-BY-6.6.0: `PROCESSING` state refs below are stale. Removed in Unit 6.6.0 (hand-sim-jqtr, e80962b). Contract is BOOTING/STANDBY/IDLE/EXECUTING/FAULT. Kept for history, do not implement.

* **Goal**: Mount a procedural pneumatic suction tool (Dexterous Palm) to UR5e flange `tool0` in Three.js, implement EdgeNode lifecycle state machine (`BOOTING`, `IDLE`, `PROCESSING`, `EXECUTING`, `FAULT`) with bounded command FIFO queue ($N=5$) and E-Stop purge, enforce Gateway 20 Hz safety gating, and provide canned trajectory triggers and palm actuation in TeleopClient.
* **Architecture**: Contract-first parallel development. Unit 4.0 locks down schemas (`PALM_ACTUATE`, canned `TRAJECTORY_EXECUTE`, `EMERGENCY_STOP`, `RESET_FAULT`) and cross-language types. Units 4.1 (3D Palm mounting), 4.2 (EdgeNode state machine & queue), 4.3 (Gateway safety gating), and 4.4 (TeleopClient operator toolbar) execute against mocked interface seams. Unit 4.5 connects all services in an automated E2E integration test suite.
* **TDD Assertion Matrix**:
  * **Test 1 (Domain / Schemas)**: Cross-language serialization tests asserting Python, Rust, and TypeScript validate `PALM_ACTUATE` (`{ "action": "GRASP" | "RELEASE" }`) and canned `TRAJECTORY_EXECUTE` payloads.
  * **Test 2 (TeleopClient / Vitest)**: Component tests asserting procedural suction tool renders parented to `tool0`, color shifts on grasp state changes, and toolbar dispatches commands only when `robot_state === 'IDLE'`.
  * **Test 3 (EdgeNode / Pytest)**: Unit tests asserting lifecycle state transitions, FIFO queueing of valid commands during `EXECUTING`, queue purge and immediate motion cancellation on `EMERGENCY_STOP`, and trajectory dispatch to ROS2 controller / mock.
  * **Test 4 (Gateway / Cargo Nextest)**: Unit tests asserting 20 Hz command rate throttling and validation error frames for out-of-bound or malformed payloads.
  * **Test 5 (Integration / Playwright)**: Multi-service integration test asserting canned trajectory execution, palm actuation, and emergency stop halt across TeleopClient, Gateway, and EdgeNode within < 50ms latency.
