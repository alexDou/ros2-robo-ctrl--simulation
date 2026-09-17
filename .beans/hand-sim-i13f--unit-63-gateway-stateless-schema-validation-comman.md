---
# hand-sim-i13f
title: 'Unit 6.3: Gateway Stateless Schema Validation & Command Routing'
status: completed
type: task
tags:
    - ready-for-agent
created_at: 2026-09-16T17:27:34Z
updated_at: 2026-09-17T11:26:00Z
parent: hand-sim-d20p
blocked_by:
    - hand-sim-yilh
---

## Parent
hand-sim-d20p

## What to build
Extend Rust Actix-Web Gateway to validate PICK_AND_PLACE_TARGET commands statelessly against schema, enforce ActiveSession rate limits, forward valid commands to DataFabric robot/{id}/command, and return structured ErrorFrame on schema violations without dropping WebSocket session.

## Acceptance criteria
- [x] Gateway parses and validates PICK_AND_PLACE_TARGET payload against JSON schema
- [x] Valid commands forwarded to Zenoh robot/{id}/command key expression
- [x] Invalid payloads reject with structured ErrorFrame (SCHEMA_VALIDATION_ERROR) over WebSocket without dropping session
- [x] Rate limiting (20 Hz) and ActiveSession exclusivity enforced
- [x] Unit tests pass in cargo nextest

## Blocked by
- hand-sim-yilh (Unit 6.0)

## Summary of Changes
- Validated `PICK_AND_PLACE_TARGET` payload against `PickAndPlaceTargetPayload` schema in `src/gateway/src/ws.rs` with strict finite float verification across `pick_x`, `pick_y`, `pick_z`, and optional `drop_x`, `drop_y`, `drop_z`.
- Enforced 20 Hz minimum-interval command rate limiting (50ms) and `ActiveSession` exclusivity (`409 Conflict`).
- Forwarded valid `PICK_AND_PLACE_TARGET` commands to Zenoh DataFabric key expression `robot/{id}/command`.
- Emitted structured `ErrorFrame` on schema violations without dropping or restarting the WebSocket session.
- Added comprehensive integration test `test_ws_pick_and_place_target_handling_and_validation` in `src/gateway/tests/ws_gateway_test.rs` covering valid pick-only, valid pick+drop, rate limit rejection, schema validation errors on missing/extra/non-finite fields, session durability, and session cleanup.
- All 22 tests pass in `cargo nextest`.
