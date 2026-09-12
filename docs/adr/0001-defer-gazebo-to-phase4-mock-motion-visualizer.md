# 0001. Defer Gazebo Physics to Phase 4 in Favor of Dynamic Mock Telemetry for Phase 3 3D Spatial Mapping

## Status
Accepted

## Context
Unit 3 was originally drafted as "3D Visualization & Gazebo Harmonic Sync", coupling Three.js URDF web visualization directly with live Gazebo Harmonic physics simulation startup. However, running a full physics simulator inside the developer VM environment introduces heavy CPU/memory startup overhead and non-deterministic process lifecycles that slow down TDD cycles and browser visualization iterations.

## Decision
We decided to defer full Gazebo Harmonic physics simulation activation to Phase 4 (Object Ingestion & AI Model Orchestration). For Phase 3, we drive the 3D `RobotVisualizer` and `TelemetryMonitor` using a dedicated 30 Hz sinusoidal `mock_motion_publisher.py` emitting dynamic multi-axis joint states.

## Consequences
- Phase 3 development and CI suites run fast, offline, and hermetically without spawning external Gazebo simulator processes.
- 3D WebGL viewport rendering, URDF kinematic chain mapping, REP-103 frame alignment, and the 75/25 split UI layout are thoroughly verified against smooth multi-axis continuous motion.
- Gazebo simulation controllers, world spawner, and physics launch automation are isolated to Phase 4 where camera buffers and physical object interactions are introduced.
