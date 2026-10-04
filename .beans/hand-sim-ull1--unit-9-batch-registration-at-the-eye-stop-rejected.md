---
# hand-sim-ull1
title: 'Unit 9.09: Batch registration at the eye stop (Rejected)'
status: todo
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-10-04T13:30:39Z
updated_at: 2026-10-04T13:36:34Z
parent: hand-sim-rqpy
blocked_by:
    - hand-sim-o9vg
---

## What to build

At every eye stop the orchestrator registers each Batch Gearwheel with WorkcellNode using tracked positions: intact → pickable, defective → Rejected (registered, not for processing, stays on the belt). WorkcellState schema gains Rejected.

Spec + binding decision log: support_files/specs/unit9/ (overview.md, implementation_wireframe.md). ADR 0006. Branch: feat/conveyor-devices.

## Acceptance criteria

- [ ] Workcell + orchestrator pytest: intact pickable, defective Rejected, no arm motion
- [ ] Contract tests for Rejected
- [ ] verify: GREEN

## Blocked by

- hand-sim-o9vg (08)
