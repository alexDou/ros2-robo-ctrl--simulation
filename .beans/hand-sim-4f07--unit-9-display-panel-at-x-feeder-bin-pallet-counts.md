---
# hand-sim-4f07
title: 'Unit 9.13: display panel at +X (feeder, bin, pallet counts)'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-10-04T13:30:39Z
updated_at: 2026-10-05T16:09:40Z
parent: hand-sim-rqpy
blocked_by:
    - hand-sim-q2ur
    - hand-sim-mt82
---

## What to build

Post-mounted display panel at +X outside the belt, Y ≈ 0, facing the default camera, clear of the ScrapBin path: FlexFeeder remaining, ScrapBin count, Pallet counts n/10. Telemetry-driven only. Panel position via schema constant.

Spec + binding decision log: docs_src/specs/unit9/ (overview.md, implementation_wireframe.md). ADR 0006. Branch: feat/conveyor-devices.

## Acceptance criteria

- [ ] vitest: panel values follow cell_state + WorkcellState
- [ ] Screenshot check: panel visible from default camera
- [ ] verify: GREEN

## Blocked by

- hand-sim-q2ur (11)
- hand-sim-mt82 (12)

Done: DISPLAY_PANEL schema constant (0.85, 0, 0), assets/panel.ts canvas-texture panel, driven by hopperCount (feeder), WorkcellState scrapped/processed (bin) and pallet counts. Screenshot-checked from default camera.
