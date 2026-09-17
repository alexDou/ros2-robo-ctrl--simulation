---
# hand-sim-yilh
title: 'Unit 6.0: Domain Schemas, Wire Contracts & Cross-Language Types'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-16T17:26:29Z
updated_at: 2026-09-17T09:36:11Z
parent: hand-sim-d20p
---

## Parent
hand-sim-d20p

## What to build
Define single source of truth wire schemas for PICK_AND_PLACE_TARGET command. Regenerate cross-language domain models across Python, Rust, and TypeScript via scripts/generate_domain.py. Validate bidirectional JSON serialization with cross-language contract tests before implementing node logic.

## Acceptance criteria
- [ ] PICK_AND_PLACE_TARGET added to CommandType enum with pick_and_place_target_payload in schemas/robot_command.schema.json
- [ ] Domain models regenerated for Python, Rust, and TypeScript via scripts/generate_domain.py with 0 drift
- [ ] Helper command builders added in web/domain/parsers.ts
- [ ] Cross-language contract serialization unit tests pass in Python (pytest), Rust (cargo nextest), and TypeScript (vitest)

## Blocked by
- None (can start immediately)

## Summary of Changes

- Added PICK_AND_PLACE_TARGET to CommandType enum in schemas/robot_command.schema.json with pick_and_place_target_payload (required: pick_x, pick_y, pick_z; optional: drop_x, drop_y, drop_z; additionalProperties: false).
- Regenerated cross-language domain models via scripts/generate_domain.py across Python (src/domain/domain.py), Rust (src/domain/domain.rs), and TypeScript (web/domain/contracts.ts) with 0 drift.
- Added createPickAndPlaceTargetCommand helper builders and overload signatures in web/domain/parsers.ts.
- Updated Gateway command validation in src/gateway/src/ws.rs for CommandType::PickAndPlaceTarget.
- Added cross-language domain contract serialization unit tests in Python (tests/test_domain.py), Rust (src/gateway/tests/domain_contract_test.rs), and TypeScript (web/tests/unit/contracts.test.ts).
- All tests pass across Python pytest (43/43), Rust cargo test / nextest (21/21), and Web vitest (136/136).
