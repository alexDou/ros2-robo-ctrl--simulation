---
# hand-sim-2ved
title: 'Unit 3.4: Dynamic Motion Multi-Service Integration & Latency Suite'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-12T13:20:33Z
updated_at: 2026-09-12T16:28:19Z
parent: hand-sim-liyi
blocked_by:
    - hand-sim-ihmn
    - hand-sim-alr9
---

## Parent

hand-sim-liyi

## What to build

Implement a comprehensive multi-service automated end-to-end integration test suite using Playwright and Cucumber-Gherkin. Orchestrate the concurrent startup, readiness verification, and clean teardown of the continuous sinusoidal mock motion publisher (`mock_motion_publisher.py`), EdgeNode, Gateway, and TeleopClient Vite development server. Verify the full vertical 3D spatial tracer bullet: dynamic 30 Hz sinusoidal joint positions traverse DataFabric `robot/{id}/telemetry`, multiplex through Gateway to ActiveSession WebSocket, update the 3D WebGL `RobotVisualizer` mesh link postures, and update sidebar `TelemetryMonitor` numerical readouts concurrently. Assert that end-to-end telemetry latency remains strictly under 50ms, all 6 joints oscillate dynamically, and no WebGL render bottlenecks or memory leaks occur during sustained execution.

## Acceptance criteria

- [x] E2E test harness manages concurrent lifecycle of mock motion publisher, EdgeNode, Gateway, and TeleopClient.
- [x] Gherkin feature scenarios verify dynamic 30 Hz sinusoidal motion flows from publisher to 3D canvas and sidebar monitor.
- [x] Test asserts end-to-end telemetry delivery latency remains < 50ms without frame queuing or UI sluggishness.
- [x] Test verifies dynamic link coordinate changes in Three.js visualizer scene matching incoming `ArmJointPositions`.
- [x] Test asserts numerical joint angle readouts in `TelemetryMonitor` sidebar update continuously in sync with 3D canvas.
- [x] Clean process teardown and WebGL context disposal upon test completion or unexpected failure.

## Blocked by

- hand-sim-ihmn (Unit 3.1: EdgeNode 30 Hz Continuous Sinusoidal Mock Motion Publisher)
- hand-sim-alr9 (Unit 3.3: 60 FPS Telemetry Kinematic Synchronization & REP-103 Frame Alignment)
