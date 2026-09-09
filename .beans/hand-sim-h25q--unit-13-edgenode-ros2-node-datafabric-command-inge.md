---
# hand-sim-h25q
title: 'Unit 1.3: EdgeNode ROS2 Node & DataFabric Command Ingestion'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-09T15:14:10Z
updated_at: 2026-09-09T18:11:39Z
parent: hand-sim-e8n5
blocked_by:
    - hand-sim-myia
---

## Parent

hand-sim-2ihi

## What to build

Implement the Python EdgeNode combining ROS2 Jazzy (`rclpy`) and `eclipse-zenoh` in `src/edge_node`. Establish a Zenoh session subscribing to DataFabric topic `robot/{id}/command`. On receipt of a valid `PING` RobotCommand, log the command receipt using the native ROS2 logger (`node.get_logger().info()`). Immediately synthesize and publish a confirmation RobotTelemetryEvent to Zenoh topic `robot/{id}/telemetry` with `robot_state="IDLE"`, UR5e 6-DoF zero angles (`[0.0, 0.0, 0.0, 0.0, 0.0, 0.0]`), timestamp, and confirmation metadata. Handle malformed Zenoh payloads gracefully with structured error logs without terminating the node.

## Acceptance criteria

- [ ] EdgeNode boots cleanly using `rclpy` executor and establishes a Zenoh session.
- [ ] EdgeNode subscribes to `robot/{id}/command` and deserializes incoming RobotCommand payloads via pydantic.
- [ ] Receipt of a `PING` command triggers a message log in the ROS2 node logger.
- [ ] EdgeNode publishes an acknowledging RobotTelemetryEvent to `robot/{id}/telemetry` containing valid `robot_state="IDLE"` and 6 zero-angle joint positions.
- [ ] Invalid or malformed Zenoh payloads log an error and are dropped without crashing the EdgeNode process.
- [ ] Automated tests in `pytest` verify command deserialization, ROS2 logger invocation, and telemetry event emission.

## Blocked by

- hand-sim-1sc2 (Unit 1.1: Domain Schemas & DataFabric Contract Baseline)

## Verification Summary
- Implemented EdgeNode combining rclpy Node logger and Eclipse Zenoh session.
- Subscribes to robot/{id}/command and deserializes RobotCommand.
- On PING command, logs via ROS2 node logger and publishes acknowledging RobotTelemetryEvent to robot/{id}/telemetry with IDLE state and 6 zero-angle joint positions.
- Malformed payloads handled gracefully without crashing process.
- Verified via pytest in tests/test_edge_node.py.
