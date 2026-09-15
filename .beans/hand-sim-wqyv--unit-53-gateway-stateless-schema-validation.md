---
# hand-sim-wqyv
title: 'Unit 5.3: Gateway Stateless Schema Validation'
status: todo
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-15T22:29:20Z
updated_at: 2026-09-15T22:29:21Z
parent: hand-sim-7w33
blocked_by:
    - hand-sim-tuyu
---

## Parent
hand-sim-7w33

## What to build
Actix-Web WebSocket boundary validation in Gateway for SPAWN_OBJECT and CLEAR_WORKSPACE commands, forwarding valid frames to Zenoh topic robot/{id}/command, and returning structured ErrorFrames for schema violations without severing connection.

## Acceptance criteria
- [ ] Gateway deserializes and validates SPAWN_OBJECT payload (x, y, z, object_type)
- [ ] Gateway deserializes and validates CLEAR_WORKSPACE payload ({})
- [ ] Valid commands published to Zenoh robot/{id}/command
- [ ] Malformed or invalid frames return structured ErrorFrame without terminating WebSocket connection
- [ ] Gateway integration tests pass verifying frame handling and error responses

## Blocked by
- hand-sim-tuyu (Unit 5.0)
