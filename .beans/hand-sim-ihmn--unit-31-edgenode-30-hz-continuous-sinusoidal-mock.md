---
# hand-sim-ihmn
title: 'Unit 3.1: EdgeNode 30 Hz Continuous Sinusoidal Mock Motion Publisher'
status: todo
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-12T13:20:33Z
updated_at: 2026-09-12T13:26:56Z
parent: hand-sim-liyi
---

## Parent

hand-sim-liyi

## What to build

Implement a standalone ROS2/EdgeNode executable `mock_motion_publisher.py` in `src/edge_node/` that generates deterministic, smooth 30 Hz continuous multi-axis sinusoidal trajectories across all 6 canonical UR5e revolute joints (`shoulder_pan_joint`, `shoulder_lift_joint`, `elbow_joint`, `wrist_1_joint`, `wrist_2_joint`, `wrist_3_joint`). Parameterize each joint with distinct non-harmonic frequencies, amplitudes, and phase offsets to produce rich, organic 3D spatial exploration while strictly bounding all values within physical limits ($[-\pi, \pi]$). Publish synthetic joint states over native ROS2 `sensor_msgs/msg/JointState` on `/joint_states` and emit typed `RobotTelemetryEvent` frames over DataFabric `robot/{id}/telemetry` with nanosecond timestamps. Provide offline Pytest unit tests verifying frequency stability, 30 Hz cadence, joint limit bounds, and schema contract validation.

## Acceptance criteria

- [ ] Standalone `mock_motion_publisher.py` generates smooth multi-axis sinusoidal trajectories across all 6 canonical UR5e joints.
- [ ] Each joint oscillates with distinct frequency, amplitude, and phase offset to create rich spatial motion.
- [ ] Joint angles are strictly clamped within physical limits ($[-\pi, \pi]$) to prevent self-colliding or unphysical postures.
- [ ] Publisher emits both native ROS2 `sensor_msgs/msg/JointState` at 30 Hz and serialized `RobotTelemetryEvent` frames over DataFabric `robot/{id}/telemetry`.
- [ ] Offline Pytest unit tests assert continuous 30 Hz publication cadence, zero-order hold behavior, and strict schema compliance.

## Blocked by

None (can start immediately).
