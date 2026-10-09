### Frame Aggregation & Zero-State Telemetry

* Goal: Stream live, zero-state structural telemetry (empty joint matrices) at a browser-optimized 30 Hz from a ROS2 simulator node through Gateway to TeleopClient without browser lag.
* Agent Instructions: Implement a hybrid mock joint architecture (standalone ROS2 publisher script + offline test fixture). Configure a named UR5e joint state extractor with zero-order hold (resilient to extraneous gripper joints). Decouple high-frequency ingestion in TeleopClient using a non-reactive buffer and direct DOM ref updates via `requestAnimationFrame` (zero VDOM diffing overhead). When telemetry is actively streaming, remove "Verify connection" controls from the DOM completely.
* TDD Assertion Matrix:
* Test 1 (EdgeNode / Python): Unit test `JointStateMapper` to verify named extraction of UR5e 6-DoF joints, zero-order hold on missing joints, resilience to extraneous joints (e.g. gripper), and schema-compliant serialization of `RobotTelemetryEvent`.
* Test 2 (Gateway / Rust): Unit test Gateway DataFabric subscriber and WebSocket dispatcher to assert continuous, non-blocking 30 Hz telemetry forwarding to ActiveSession without frame drops or memory growth.
* Test 3 (TeleopClient / Preact): Component test in Vitest asserting that receiving a 30 Hz telemetry stream updates the non-reactive ref buffer, transitions state to `CONNECTED / IDLE`, displays the streaming rate, removes "Verify connection" controls from the DOM, and does not trigger unneeded VDOM re-renders.
