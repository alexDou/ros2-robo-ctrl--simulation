---
# hand-sim-3hb6
title: 'Unit 5.4: TeleopClient Operator Toolbar Clear Workspace'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-15T22:29:24Z
updated_at: 2026-09-16T12:13:00Z
parent: hand-sim-7w33
blocked_by:
    - hand-sim-tuyu
---

## Parent
hand-sim-7w33

## What to build
Add 'Clear Workspace' button to OperatorToolbar in TeleopClient, enabling manual reset of active workcell workpieces with proper lifecycle state gating and WebSocket command serialization.

## Acceptance criteria
- [x] 'Clear Workspace' button added to OperatorToolbar
- [x] Button enabled only when robot_state === 'IDLE' and an active gear is present in the workspace
- [x] Button click dispatches CLEAR_WORKSPACE command via WebSocket connection
- [x] Button click destroys 3D gearwheel mesh in RobotVisualizer and lifts ClickLockout
- [x] TeleopClient component tests pass verifying button state interlocks and command dispatch

## Blocked by
- hand-sim-tuyu (Unit 5.0)

## Implementation Summary
- Added 'Clear Workspace' button (`data-testid="clear-workspace-button"`) to `OperatorToolbar` within `workspace-control-cluster` in `web/src/components/OperatorToolbar.tsx`.
- Gated button state via `clearWorkspaceDisabled = disabled || !isIdle || !hasActiveGear` ensuring button is only active when `robot_state === 'IDLE'`, an active workpiece is present, and connection is active.
- Wired `handleClearWorkspace` in `web/src/components/TeleopClient.tsx`: dispatches typed `CLEAR_WORKSPACE` command through open WebSocket session and resets `hasActiveGear` state.
- Integrated with `RobotVisualizer` reactive lifecycle to destroy the 3D procedural gearwheel mesh and release `ClickLockout`.
- Updated Playwright page object `TeleopPage.ts` with `clearWorkspaceButton` and action/assertion methods.
- Added comprehensive unit test coverage in `web/tests/unit/TeleopClient.test.tsx` verifying default disabled state, gear presence enabling, command dispatch serialization, visualizer mesh destruction and lockout release, robot state interlocks, and disconnect gating. All tests pass with 0 type errors or lint warnings.
