---
# hand-sim-w824
title: 'Unit 9.07: FlexFeeder device and CELL_FILL'
status: todo
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-10-04T13:30:39Z
updated_at: 2026-10-04T13:36:34Z
parent: hand-sim-rqpy
blocked_by:
    - hand-sim-42d4
---

## What to build

virtual_plc FlexFeeder block: FILL generates the seeded deck (10 defective random colours + 30/30/30), placements only while the belt runs with ≥ 0.13 m encoder spacing and variable cycle time, disabled at eye stop, QUICK_EMPTY; placement ring buffer with mocked colour/intact (GearClassifier seam). Feeder device node. CELL_FILL + feeder_remaining end to end (schema, orchestrator, EdgeNode, Gateway, Fill button).

Spec + binding decision log: support_files/specs/unit9/ (overview.md, implementation_wireframe.md). ADR 0006. Branch: feat/conveyor-devices.

## Acceptance criteria

- [ ] Seeded deck composition test
- [ ] Spacing ≥ 0.13 m, no placement while belt stopped
- [ ] Fill enabled only in EMPTY; feeder_remaining shown after Fill
- [ ] verify: GREEN

## Blocked by

- hand-sim-42d4 (06)
