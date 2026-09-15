---
# hand-sim-tuyu
title: 'Unit 5.0: Domain Schemas & Spawning Contracts'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-15T22:29:07Z
updated_at: 2026-09-15T22:43:57Z
parent: hand-sim-7w33
---

## Parent
hand-sim-7w33

## What to build
Define wire schemas for SPAWN_OBJECT and CLEAR_WORKSPACE commands. Synchronize cross-language domain types across Python, Rust, and TypeScript. Validate bidirectional JSON serialization with cross-language unit tests before implementing node logic.

## Acceptance criteria
- [x] SPAWN_OBJECT payload schema defined with x, y, z, and object_type in robot_command schema
- [x] CLEAR_WORKSPACE payload schema defined with empty object in robot_command schema
- [x] Domain models regenerated for Python, Rust, and TypeScript via scripts/generate_domain.py
- [x] Cross-language serialization tests pass in Rust, Python, and TypeScript

## Blocked by
- None (can start immediately)

## Implementation Summary

- Updated `schemas/robot_command.schema.json` with `SPAWN_OBJECT` and `CLEAR_WORKSPACE` in `CommandType` enum and added `spawn_object_payload` and `clear_workspace_payload` in ``.
- Updated `scripts/generate_domain.py` to emit `#[serde(deny_unknown_fields)]` for strict models and derive `Default` on `ClearWorkspacePayload`.
- Regenerated `src/domain/domain.py`, `src/domain/domain.rs`, and `web/domain/contracts.ts`. Verified 0 drift with `python3 scripts/generate_domain.py --check`.
- Added helper creators `createSpawnObjectCommand` and `createClearWorkspaceCommand` in `web/domain/parsers.ts`.
- Supported `CommandType::SpawnObject` and `CommandType::ClearWorkspace` payload validation in `src/gateway/src/ws.rs`.
- Added comprehensive unit and contract tests in Python (`tests/test_domain.py`), Rust (`src/gateway/tests/domain_contract_test.rs`), and TypeScript (`web/tests/unit/contracts.test.ts`).
