---
# hand-sim-r6xx
title: 'Unit 6.5-Bugfix.3: Web Visualizer Unit 5 & 6 Lifecycle Harmonization'
status: todo
type: task
tags:
    - ready-for-agent
created_at: 2026-09-18T15:00:14Z
updated_at: 2026-09-18T15:00:14Z
parent: hand-sim-s0tn
blocked_by:
    - hand-sim-1h63
---

Harmonize web visualizer lifecycle and state synchronization across web/src/components/TeleopClient.tsx, web/src/hooks/useTeleopSession.ts, and web/src/components/RobotVisualizer.tsx. Pass onSpawnObject callback prop to RobotVisualizer. Auto-reset hasActiveGear = false and clear actionProgress when robot_state returns to IDLE after pick-and-place execution. Initialize loadedRobot at CANONICAL_POSES.HOME joint angles instead of 0 rad flat pose on URDF load. Ensure workspace gears are preserved properly on table interaction. Run test, lint, and typecheck.
