---
# hand-sim-jqtr
title: 'Unit 6.6.0: Drop dead PROCESSING state'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-20T10:44:11Z
updated_at: 2026-09-21T10:47:13Z
parent: hand-sim-4814
---

## Parent

hand-sim-4814

## What to build

RobotState shrinks to BOOTING/STANDBY/IDLE/EXECUTING/FAULT across schema and all generated types. No producer emits PROCESSING today.

## Acceptance criteria

- [ ] schemas/robot_telemetry_event.schema.json enum has no PROCESSING
- [ ] scripts/generate_domain.py regen clean; domain.py/.rs/contracts.ts carry 5 states
- [ ] cross-language serialization tests green

## Blocked by

None (can start immediately).
