---
# hand-sim-w3t4
title: 'Unit 6.5-Bugfix.5: Live Multi-Service Integration Suite Verification'
status: todo
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-18T22:08:56Z
updated_at: 2026-09-21T10:33:16Z
parent: hand-sim-s0tn
blocked_by:
    - hand-sim-hd13
---

Validate full live system integration across ROS2, Gateway, and Web Visualizer without simulation shortcuts or mock bypasses. Boot launch_ros2.sh and launch_gateway.sh. Verify 5 Hz sim joint_states ingestion (ur_controllers.yaml, fake hardware; 500 Hz RTDE real-only, not running), Gateway 30 Hz nominal tick (passthrough/sample-hold in practice), and rAF render from latest sample (connect-gated browser, BOOTING window, lazy sub while parked). Verify table click -> gear spawn -> IK trajectory execution -> SpindleTower stacking -> return to HOME -> UI unlock. Verify deterministic teardown with zero orphan background processes.

## Rate-truth 2026-09-21: no 500 Hz running. Sim = 5 Hz. Gateway = 30 Hz tick, 5 Hz feed. Browser = connect-gated, no 60FPS interp of 500 Hz stream.
