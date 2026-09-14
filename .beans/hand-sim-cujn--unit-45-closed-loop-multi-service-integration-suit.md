---
# hand-sim-cujn
title: 'Unit 4.5: Closed-Loop Multi-Service Integration Suite'
status: todo
type: task
tags:
    - ready-for-agent
created_at: 2026-09-14T15:17:56Z
updated_at: 2026-09-14T15:17:56Z
parent: hand-sim-lm3u
blocked_by:
    - hand-sim-osnb
    - hand-sim-gvq7
    - hand-sim-8t28
    - hand-sim-cxnx
---

## Parent

hand-sim-lm3u

## What to build

Implement the multi-service automated end-to-end integration test suite using Playwright and Cucumber, orchestrating live `TeleopClient`, `Gateway`, and `EdgeNode` processes concurrently over real WebSocket and `DataFabric` networks. Verify the complete vertical actuation and safety loop across the stack: commanding canned poses updates 3D link transforms and reaches target posture within sub-50ms latency; toggling palm grasp updates the suction nozzle visual material and reflects `is_grasped` in telemetry; triggering an Emergency Stop during active motion halts all movement immediately (<50ms) and transitions the system to `FAULT`; and clicking "Reset Fault" safely restores `IDLE` readiness without uncommanded motion.

## Acceptance criteria

- [ ] Automated multi-service test harness boots real `EdgeNode`, `Gateway`, and `TeleopClient` services concurrently.
- [ ] End-to-end test asserts clicking "Ready" transitions state `IDLE` $\to$ `PROCESSING` $\to$ `EXECUTING` $\to$ `IDLE` and positions the UR5e model accurately in the 3D scene within latency budget (<50ms).
- [ ] End-to-end test asserts clicking "Grasp" executes pneumatic delay, highlights the Dexterous Palm nozzle in Three.js, and sets `is_grasped: true` in telemetry.
- [ ] End-to-end test asserts clicking "EMERGENCY STOP" during trajectory execution immediately halts joint motion, transitions `robot_state` to `FAULT`, and locks toolbar action buttons.
- [ ] End-to-end test asserts clicking "Reset Fault" clears the fault and restores `IDLE` without causing joint motion.
- [ ] Automated suite runs cleanly in headless CI environment without flakiness or orphaned processes.

## Blocked by

- hand-sim-osnb (Unit 4.1: Dexterous Palm 3D Model & Kinematic Flange Mounting)
- hand-sim-gvq7 (Unit 4.2: EdgeNode Lifecycle State Machine & SingleCommandGating)
- hand-sim-8t28 (Unit 4.3: Gateway Safety Gating & 20 Hz Command Throttling)
- hand-sim-cxnx (Unit 4.4: TeleopClient Operator Toolbar & Lifecycle Controls)
