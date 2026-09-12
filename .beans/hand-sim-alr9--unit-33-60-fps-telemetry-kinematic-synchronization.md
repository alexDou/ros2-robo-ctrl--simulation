---
# hand-sim-alr9
title: 'Unit 3.3: 60 FPS Telemetry Kinematic Synchronization & REP-103 Frame Alignment'
status: todo
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-12T13:20:33Z
updated_at: 2026-09-12T13:27:02Z
parent: hand-sim-liyi
blocked_by:
    - hand-sim-2lcq
---

## Parent

hand-sim-liyi

## What to build

Implement 60 FPS zero-order hold kinematic latching in `RobotVisualizer` that synchronizes incoming `ArmJointPositions` with the Three.js `URDFRobot` manipulator model without triggering Virtual-DOM re-renders. Synchronously buffer incoming 30 Hz WebSocket telemetry into a mutable non-reactive reference. In the `requestAnimationFrame` loop, inspect incoming `ArmJointPositions` against previously rendered angles using dirty-checking: apply joint rotations via `setJointValue` by canonical joint name and execute a WebGL draw call only when joint angles change or OrbitControls are actively orbiting. Bypass WebGL render calls entirely when joint angles and camera are static, reducing idle GPU/CPU consumption to near zero. Enforce strict ROS REP-103 (+X forward, +Y left, +Z up) to WebGL (+X right, +Y up, +Z back) coordinate alignment via root group transformation (`robotGroup.rotation.x = -Math.PI / 2`) with zero manual quaternion swizzling. Provide Vitest unit tests verifying kinematic link transformation updates, REP-103 root rotation, and dirty-checked render skipping.

## Acceptance criteria

- [ ] Incoming 30 Hz `ArmJointPositions` stored in mutable non-reactive buffer reference without VDOM re-rendering.
- [ ] Animation loop synchronizes all 6 canonical revolute joints by exact joint name using `URDFRobot.setJointValue`.
- [ ] Dirty-checked render loop skips WebGL draw calls when joint angles and camera position remain unchanged.
- [ ] Manipulator root group applies REP-103 coordinate alignment (`robotGroup.rotation.x = -Math.PI / 2`) with zero manual component swizzling.
- [ ] Link world matrices update accurately in response to dynamic `ArmJointPositions` updates.
- [ ] Vitest unit tests verify kinematic transformation matrix propagation, REP-103 alignment, and idle render bypass.

## Blocked by

- hand-sim-2lcq (Unit 3.2: TeleopClient Three.js RobotVisualizer Canvas & 75/25 Layout)
