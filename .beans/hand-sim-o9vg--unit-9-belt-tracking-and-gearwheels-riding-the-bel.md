---
# hand-sim-o9vg
title: 'Unit 9.08: belt tracking and Gearwheels riding the belt in the scene'
status: todo
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-10-04T13:30:39Z
updated_at: 2026-10-04T13:36:34Z
parent: hand-sim-rqpy
blocked_by:
    - hand-sim-w824
---

## What to build

Conveyor node tracks every placed Gearwheel from placement records + encoder travel; cell_state.belt_gears (id, x, y, color, intact). Scene renders the FlexFeeder module at the upstream end and Gearwheels travelling to the eye stop, extrapolated between updates.

Spec + binding decision log: support_files/specs/unit9/ (overview.md, implementation_wireframe.md). ADR 0006. Branch: feat/conveyor-devices.

## Acceptance criteria

- [ ] Tracked positions match virtual_plc ground truth within tolerance
- [ ] Batch = Gearwheels inside the PickZone at eye stop; upstream ones stay on the belt
- [ ] vitest: scene gears follow cell_state
- [ ] verify: GREEN

## Blocked by

- hand-sim-w824 (07)
