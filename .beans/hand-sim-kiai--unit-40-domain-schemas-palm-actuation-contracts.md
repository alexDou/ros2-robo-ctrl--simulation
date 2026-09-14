---
# hand-sim-kiai
title: 'Unit 4.0: Domain Schemas & Palm Actuation Contracts'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-14T15:17:02Z
updated_at: 2026-09-14T15:40:16Z
parent: hand-sim-lm3u
---

## Parent

hand-sim-lm3u

## What to build

Lock the single source of truth for all end-effector actuation and lifecycle command schemas across the distributed system. Extend the canonical wire schemas to define typed payloads for palm actuation (`PALM_ACTUATE` with `GRASP` and `RELEASE` actions), canned trajectory execution (`TRAJECTORY_EXECUTE` with pose names `HOME`, `READY`, `INSPECT_POSE` or waypoint arrays), emergency stopping (`EMERGENCY_STOP`), and fault clearance (`RESET_FAULT`). Extend the telemetry event schema to enforce mandatory `palm_state` (`{ is_grasped: boolean }`) with a safe default. Regenerate cross-language domain models for Python (Pydantic), Rust (Serde), and TypeScript (Zod) via the domain generator script. Ensure all domain models pass cross-language serialization and deserialization unit test suites hermetically before any node implementation begins.

## Acceptance criteria

- [ ] `schemas/robot_command.schema.json` updated with `PALM_ACTUATE`, `TRAJECTORY_EXECUTE`, `EMERGENCY_STOP`, and `RESET_FAULT` command types and formal payload sub-schemas.
- [ ] `schemas/robot_telemetry_event.schema.json` updated with mandatory `palm_state` property (`{ is_grasped: boolean }`).
- [ ] `scripts/generate_domain.py` updated to parse and generate typed payload models and palm state definitions across Rust (`src/domain/domain.rs`), Python (`src/domain/domain.py`), and TypeScript (`web/domain/contracts.ts`).
- [ ] Python contract unit tests (`pytest tests/test_domain.py`) assert valid serialization and deserialization of all new command payloads and telemetry events.
- [ ] Rust contract unit tests (`cargo nextest run -p gateway --test domain_contract_test`) assert Serde serialization and validation of all new command payloads and telemetry events.
- [ ] Web contract unit tests (`npm --prefix web run test`) assert Zod validation of all new command payloads and telemetry events.

## Blocked by

- None (can start immediately).

## Summary of Changes

- Updated `schemas/robot_command.schema.json` with `PALM_ACTUATE`, `TRAJECTORY_EXECUTE`, `EMERGENCY_STOP`, and `RESET_FAULT` command types and formal payload subschemas under `$defs`.
- Updated `schemas/robot_telemetry_event.schema.json` with mandatory `palm_state` (`{ is_grasped: boolean }`) with default `{"is_grasped": false}`.
- Extended `scripts/generate_domain.py` with submodel parsing, defaults (`Default` derives in Rust, Pydantic `Field(default_factory=...)`, Zod `.default(...)`), array of fixed arrays (`waypoints`), and verified zero drift via `--check`.
- Re-exported domain models in `src/edge_node/__init__.py`.
- Implemented comprehensive contract unit tests across Python (`tests/test_domain.py`), Rust (`src/gateway/tests/domain_contract_test.rs`), and Web (`web/tests/unit/contracts.test.ts`).
- Updated web component test fixtures to include `palm_state`. All tests passing across Rust, Python, and Web.
