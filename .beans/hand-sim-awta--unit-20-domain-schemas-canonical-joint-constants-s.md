---
# hand-sim-awta
title: 'Unit 2.0: Domain Schemas & Canonical Joint Constants Sync'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-11T16:01:56Z
updated_at: 2026-09-11T20:17:37Z
parent: hand-sim-8n0g
---

## Parent

hand-sim-8n0g

## What to build

Establish and lock the canonical 6-DoF UR5e joint sequence and domain schema baseline for Phase 2. Verify that `schemas/robot_telemetry_event.schema.json` enforces exact 6-DoF float arrays for `joint_positions` and nanosecond timestamps. Codify canonical UR5e joint name constants (`shoulder_pan_joint`, `shoulder_lift_joint`, `elbow_joint`, `wrist_1_joint`, `wrist_2_joint`, `wrist_3_joint`) in domain schemas and run `scripts/generate_domain.py` to regenerate type-safe contract models across Python, Rust, and TypeScript. Provide unit tests in each language confirming strict schema validation and constant alignment.

## Acceptance criteria

- [x] Canonical UR5e joint name constants codified and synchronized across schemas and code generators.
- [x] Cross-language domain bindings regenerated via `scripts/generate_domain.py` without manual drift.
- [x] Python unit tests verify `RobotTelemetryEvent` Pydantic model serialization, validation, and joint count enforcement.
- [x] Rust unit tests verify `RobotTelemetryEvent` Serde struct serialization and deserialization via `cargo nextest`.
- [x] TypeScript contract types in TeleopClient verified with Vitest.
- [x] Cross-language validation confirms non-compliant payloads (e.g. wrong joint counts, non-finite values) fail cleanly.

## Blocked by

None (can start immediately).
