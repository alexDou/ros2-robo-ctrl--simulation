---
# hand-sim-cxnx
title: 'Unit 4.4: TeleopClient Operator Toolbar & Lifecycle Controls'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-14T15:17:43Z
updated_at: 2026-09-14T17:01:54Z
parent: hand-sim-lm3u
blocked_by:
    - hand-sim-kiai
---

## Parent

hand-sim-lm3u

## What to build

Implement a sleek, modern operator toolbar docked directly beneath the 3D viewport canvas in `TeleopClient`. Provide intuitive operator controls organized logically: Canned Poses (`Home`, `Ready`, `Inspect`) on the left, Palm toggle button (`Grasp` / `Release` with visual status indicator) in the center, and a safety cluster on the right containing a `Reset Fault` button and a prominent, high-visibility red `EMERGENCY STOP` button. Implement strict UI interlocks disabling action buttons whenever `robot_state !== 'IDLE'`. Keep `Reset Fault` disabled unless `robot_state === 'FAULT'`, and keep `EMERGENCY STOP` permanently enabled and responsive. When an incoming `ErrorFrame` is received over WebSocket, append it to the Telemetry Event Log and display a transient 2-second red warning banner across the toolbar to alert the operator immediately without modal popups.

## Acceptance criteria

- [ ] Operator toolbar component rendered beneath the 3D viewport in `TeleopClient`.
- [ ] Canned Pose buttons dispatch `TRAJECTORY_EXECUTE` commands with canonical names (`HOME`, `READY`, `INSPECT_POSE`).
- [ ] Palm toggle button dispatches `PALM_ACTUATE` commands and visually reflects current `palm_state.is_grasped` status.
- [ ] Emergency Stop button is permanently visible, prominently styled in high-visibility red, and dispatches `EMERGENCY_STOP` unconditionally.
- [ ] Action buttons are disabled when `robot_state !== 'IDLE'`; `Reset Fault` is enabled only when `robot_state === 'FAULT'`.
- [ ] Inbound `ErrorFrame` frames append to the Telemetry Event Log and trigger a transient 2-second warning banner on the toolbar.
- [ ] Offline Vitest component tests in `web/tests/unit/TeleopClient.test.tsx` verify button dispatching, UI interlocking, and error banner rendering.

## Blocked by

- hand-sim-kiai (Unit 4.0: Domain Schemas & Palm Actuation Contracts)


## Summary of Changes

- Implemented `OperatorToolbar` in `web/src/components/OperatorToolbar.tsx` with 3 clusters: Canned Poses (`Home`, `Ready`, `Inspect`), Palm Toggle (`Grasp` / `Release` with status badge), and Safety Cluster (`Reset Fault` and high-visibility red `EMERGENCY STOP`).
- Wired UI interlocks: action buttons disabled when `robot_state !== 'IDLE'`, `Reset Fault` enabled only on `FAULT`, `EMERGENCY STOP` unconditionally enabled.
- Added command generator helpers in `web/domain/parsers.ts` for `createTrajectoryExecuteCommand`, `createPalmActuateCommand`, `createEmergencyStopCommand`, and `createResetFaultCommand`.
- Added transient 2-second error banner on inbound `ErrorFrame` with auto-clearing timer.
- Integrated toolbar into `TeleopClient.tsx` directly beneath `RobotVisualizer`.
- Added 6 unit tests to `web/tests/unit/TeleopClient.test.tsx` covering all toolbar interactions, dispatching, interlocks, and error banner timing. All 15 tests pass.
