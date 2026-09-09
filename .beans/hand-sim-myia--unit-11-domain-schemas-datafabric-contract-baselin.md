---
# hand-sim-myia
title: 'Unit 1.1: Domain Schemas & DataFabric Contract Baseline'
status: completed
type: task
tags:
    - ready-for-agent
created_at: 2026-09-09T15:14:05Z
updated_at: 2026-09-09T17:34:00Z
parent: hand-sim-e8n5
---

## Parent

hand-sim-2ihi

## What to build

Establish canonical domain schemas and cross-language contracts for the DataFabric. Define schemas for RobotCommand (with PING command type), RobotTelemetryEvent (with timestamp_ns, robot_state, UR5e 6-DoF joint_positions, and inference_metrics), and structured ERROR frames. Lock the RESTful key expressions on DataFabric to `robot/{id}/command` and `robot/{id}/telemetry`. Implement type-safe serialization models in Rust (serde), Python (pydantic), and TypeScript. Provide comprehensive unit tests across all three languages verifying round-trip serialization, deserialization, and schema validation.

## Acceptance criteria

- [x] Canonical JSON schema specifications created for RobotCommand, RobotTelemetryEvent, and Gateway ERROR frames.
- [x] RESTful DataFabric key expressions locked to `robot/{id}/command` and `robot/{id}/telemetry`.
- [x] Rust serde structs for RobotCommand, RobotTelemetryEvent, and ErrorFrame implemented and tested with cargo nextest.
- [x] Python pydantic models for RobotCommand, RobotTelemetryEvent, and ErrorFrame implemented and tested with pytest.
- [x] TypeScript contract types and interfaces implemented and verified with Vitest in TeleopClient.
- [x] Tests assert that malformed or non-compliant payloads fail deserialization cleanly with informative errors.

## Blocked by

None (can start immediately).
