---
# hand-sim-w3t4
title: 'Unit 6.5-Bugfix.5: Live Multi-Service Integration Suite Verification'
status: todo
type: task
tags:
    - ready-for-agent
created_at: 2026-09-18T22:08:56Z
updated_at: 2026-09-18T22:08:56Z
parent: hand-sim-s0tn
blocked_by:
    - hand-sim-hd13
---

Validate full live system integration across ROS2, Gateway, and Web Visualizer without simulation shortcuts or mock bypasses. Boot launch_ros2.sh and launch_gateway.sh. Verify 500 Hz DDS joint_states ingestion, Gateway 30 Hz throttling, and Three.js 60 FPS interpolation. Verify table click -> gear spawn -> IK trajectory execution -> SpindleTower stacking -> return to HOME -> UI unlock. Verify deterministic teardown with zero orphan background processes.
