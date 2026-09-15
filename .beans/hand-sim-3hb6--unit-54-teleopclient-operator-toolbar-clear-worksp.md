---
# hand-sim-3hb6
title: 'Unit 5.4: TeleopClient Operator Toolbar Clear Workspace'
status: todo
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-15T22:29:24Z
updated_at: 2026-09-15T22:29:26Z
parent: hand-sim-7w33
blocked_by:
    - hand-sim-tuyu
---

## Parent
hand-sim-7w33

## What to build
Add 'Clear Workspace' button to OperatorToolbar in TeleopClient, enabling manual reset of active workcell workpieces with proper lifecycle state gating and WebSocket command serialization.

## Acceptance criteria
- [ ] 'Clear Workspace' button added to OperatorToolbar
- [ ] Button enabled only when robot_state === 'IDLE' and an active gear is present in the workspace
- [ ] Button click dispatches CLEAR_WORKSPACE command via WebSocket connection
- [ ] Button click destroys 3D gearwheel mesh in RobotVisualizer and lifts ClickLockout
- [ ] TeleopClient component tests pass verifying button state interlocks and command dispatch

## Blocked by
- hand-sim-tuyu (Unit 5.0)
