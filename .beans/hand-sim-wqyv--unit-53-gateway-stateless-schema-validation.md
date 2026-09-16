---
# hand-sim-wqyv
title: 'Unit 5.3: Gateway Stateless Schema Validation'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-15T22:29:20Z
updated_at: 2026-09-16T11:49:00Z
parent: hand-sim-7w33
blocked_by:
    - hand-sim-tuyu
---

## Parent
hand-sim-7w33

## What to build
Actix-Web WebSocket boundary validation in Gateway for SPAWN_OBJECT and CLEAR_WORKSPACE commands, forwarding valid frames to Zenoh topic robot/{id}/command, and returning structured ErrorFrames for schema violations without severing connection.

## Acceptance criteria
- [x] Gateway deserializes and validates SPAWN_OBJECT payload (x, y, z, object_type)
- [x] Gateway deserializes and validates CLEAR_WORKSPACE payload ({})
- [x] Valid commands published to Zenoh robot/{id}/command
- [x] Malformed or invalid frames return structured ErrorFrame without terminating WebSocket connection
- [x] Gateway integration tests pass verifying frame handling and error responses

## Blocked by
- hand-sim-tuyu (Unit 5.0)

## Implementation Summary
- Updated `validate_command_payload` in `src/gateway/src/ws.rs` to validate `SPAWN_OBJECT` and `CLEAR_WORKSPACE` payloads with finite coordinate enforcement (`is_finite()`) and strict field rejection.
- Added comprehensive integration test `test_ws_spawn_object_and_clear_workspace_handling_and_validation` in `src/gateway/tests/ws_gateway_test.rs`:
  - Verified valid `SPAWN_OBJECT` command is forwarded to Zenoh command topic.
  - Verified missing coordinate fields and extraneous unknown fields return structured `SCHEMA_VALIDATION_ERROR` without severing WebSocket connection.
  - Verified non-finite / out-of-range float coordinates return `SCHEMA_VALIDATION_ERROR` without closing connection.
  - Verified valid `CLEAR_WORKSPACE` is forwarded to Zenoh command topic.
  - Verified unexpected fields on `CLEAR_WORKSPACE` return `SCHEMA_VALIDATION_ERROR`.
  - Verified connection remains open and functional for subsequent commands.
