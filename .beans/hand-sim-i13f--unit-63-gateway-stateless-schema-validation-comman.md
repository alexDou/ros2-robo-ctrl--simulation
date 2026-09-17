---
# hand-sim-i13f
title: 'Unit 6.3: Gateway Stateless Schema Validation & Command Routing'
status: todo
type: task
tags:
    - ready-for-agent
created_at: 2026-09-16T17:27:34Z
updated_at: 2026-09-16T17:27:34Z
parent: hand-sim-d20p
blocked_by:
    - hand-sim-yilh
---

## Parent
hand-sim-d20p

## What to build
Extend Rust Actix-Web Gateway to validate PICK_AND_PLACE_TARGET commands statelessly against schema, enforce ActiveSession rate limits, forward valid commands to DataFabric robot/{id}/command, and return structured ErrorFrame on schema violations without dropping WebSocket session.

## Acceptance criteria
- [ ] Gateway parses and validates PICK_AND_PLACE_TARGET payload against JSON schema
- [ ] Valid commands forwarded to Zenoh robot/{id}/command key expression
- [ ] Invalid payloads reject with structured ErrorFrame (INVALID_COMMAND_PAYLOAD) over WebSocket without dropping session
- [ ] Rate limiting (20 Hz) and ActiveSession exclusivity enforced
- [ ] Unit tests pass in cargo nextest

## Blocked by
- hand-sim-yilh (Unit 6.0)
