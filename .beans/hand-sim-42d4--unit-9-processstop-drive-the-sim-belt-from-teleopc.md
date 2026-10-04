---
# hand-sim-42d4
title: 'Unit 9.06: Process/Stop drive the SIM belt from TeleopClient'
status: todo
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-10-04T13:30:39Z
updated_at: 2026-10-04T13:36:34Z
parent: hand-sim-rqpy
blocked_by:
    - hand-sim-fd5h
---

## What to build

Gateway validates and passes through CELL_* and cell_state (throttler sample-hold keeps the latest cell_state). TeleopClient Process/Stop send intents; the belt texture scrolls from cell_state, extrapolated between 5 Hz updates. Old local belt motion is not driving the scene for this path.

Spec + binding decision log: support_files/specs/unit9/ (overview.md, implementation_wireframe.md). ADR 0006. Branch: feat/conveyor-devices.

## Acceptance criteria

- [ ] cargo nextest: CELL_* forwarded, cell_state latest-wins through the throttler (new [[test]] entries)
- [ ] vitest: Process/Stop send intents; belt offset follows cell_state
- [ ] verify: GREEN

## Blocked by

- hand-sim-fd5h (05)
