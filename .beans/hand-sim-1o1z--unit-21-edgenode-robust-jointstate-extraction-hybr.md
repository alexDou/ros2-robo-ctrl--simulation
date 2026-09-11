---
# hand-sim-1o1z
title: 'Unit 2.1: EdgeNode Robust JointState Extraction & Hybrid Mock Publisher'
status: todo
type: task
tags:
    - ready-for-agent
created_at: 2026-09-11T16:02:02Z
updated_at: 2026-09-11T16:02:02Z
parent: hand-sim-8n0g
blocked_by:
    - hand-sim-awta
---

## Parent

hand-sim-8n0g

## What to build

Implement robust ROS2 `sensor_msgs/msg/JointState` ingestion and mapping in EdgeNode. Create a `JointStateMapper` that extracts canonical 6-DoF UR5e joint angles by name in fixed sequence, applies a zero-order hold on missing joints (defaulting to 0.0 rad before initial arrival), safely ignores extraneous joints (such as future gripper joints), and rejects non-finite values (NaN/Inf). Implement a continuous 30 Hz streaming loop emitting typed `RobotTelemetryEvent` frames over DataFabric `robot/{id}/telemetry`. Build a standalone ROS2 `mock_publisher.py` script publishing synthetic zero-state joint messages at 30 Hz, alongside an offline in-memory test fixture for rapid hermetic unit testing.

## Acceptance criteria

- [ ] `JointStateMapper` extracts canonical UR5e 6-DoF joints from unordered `sensor_msgs/msg/JointState` messages.
- [ ] Mapper safely ignores extraneous joints (e.g. `robotiq_85_*` gripper joints) without error.
- [ ] Mapper preserves last known valid joint angles via zero-order hold when joints are temporarily omitted.
- [ ] Standalone `src/edge_node/mock_publisher.py` script publishes synthetic zero-state joint states at 30 Hz over native ROS2 DDS.
- [ ] EdgeNode streams serialized `RobotTelemetryEvent` payloads at 30 Hz to DataFabric `robot/{id}/telemetry`.
- [ ] Unit and integration tests in `pytest` verify mapping, rate limiting, and zero-order hold behavior offline.

## Blocked by

- hand-sim-awta (Unit 2.0: Domain Schemas & Canonical Joint Constants Sync)
