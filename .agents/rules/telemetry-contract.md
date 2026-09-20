---
apply_to: "{src,scripts,nodes,services}/**/*.{py,rs}"
---
# Telemetry Contract & Process Decoupling Guidelines

## Decoupled Process Boundary
* The Web Gateway (Rust) and AI/Robotics Node (Python) communicate strictly via Zenoh using explicit JSON serialization schemas.
* **No Raw ROS2 Types Over Network:** Never transmit raw ROS2 messages (e.g. `sensor_msgs/msg/JointState`) across Zenoh. The Python node must map and serialize values into the standardized contract schema before publishing.

## Domain Schema: RobotTelemetryEvent
All telemetry payloads published to Zenoh topic `telemetry/state` must conform to:

* `timestamp_ns`: integer, nanoseconds since Unix epoch.
* `robot_state`: string enum, strictly one of: `"BOOTING"`, `"STANDBY"`, `"IDLE"`, `"EXECUTING"`, `"FAULT"`.
* `joint_positions`: array of exactly 6 numbers (radians, matching UR5e joint kinematics).
* `inference_metrics`: object containing:
  * `latency_ms`: number (inference execution time in milliseconds).
  * `confidence`: number (detection probability score, 0.0 - 1.0).
  * `detected_object`: string (class label identifier).

## Invariants & TDD
* Python nodes must map ROS2 topics into typed contracts before emitting to Zenoh.
* Rust backend must deserialize via Serde and validate contract integrity. Unit tests must assert serialization round-trips before integration.
