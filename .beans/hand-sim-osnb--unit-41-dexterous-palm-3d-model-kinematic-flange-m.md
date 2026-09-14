---
# hand-sim-osnb
title: 'Unit 4.1: Dexterous Palm 3D Model & Kinematic Flange Mounting'
status: todo
type: task
tags:
    - ready-for-agent
created_at: 2026-09-14T15:17:12Z
updated_at: 2026-09-14T15:17:12Z
parent: hand-sim-lm3u
blocked_by:
    - hand-sim-kiai
---

## Parent

hand-sim-lm3u

## What to build

Mount the Dexterous Palm pneumatic suction tool procedurally to the UR5e kinematic flange (`tool0`) in the `RobotVisualizer` Three.js scene without requiring external mesh dependencies. Construct the suction tool using an aluminum mounting plate, pneumatic extension rod, and an industrial rubber suction nozzle geometry directly attached as children of the `tool0` link. Integrate real-time visual grasp indication by updating the mutable non-reactive `telemetryBufferRef` with `palm_state` so the 60 FPS animation loop can dirty-check grasp state transitions and toggle the nozzle material emissive highlight without triggering Preact Virtual-DOM reconciliation.

## Acceptance criteria

- [ ] Procedural Dexterous Palm geometry (mounting plate, extension rod, suction nozzle) created and parented to UR5e link `tool0` upon model loading.
- [ ] `RobotVisualizer` properly disposes of all palm geometries and materials on component unmount or model reload to prevent GPU memory leaks.
- [ ] Suction nozzle material visually toggles between idle rubber and active grasp highlight when `palm_state.is_grasped` changes.
- [ ] Kinematic synchronization runs inside the 60 FPS animation loop via `telemetryBufferRef` with zero Preact component re-renders during state updates.
- [ ] Offline Vitest unit tests in `web/tests/unit/RobotVisualizer.test.tsx` assert link parenting, material transition on grasp state changes, and clean disposal.

## Blocked by

- hand-sim-kiai (Unit 4.0: Domain Schemas & Palm Actuation Contracts)
