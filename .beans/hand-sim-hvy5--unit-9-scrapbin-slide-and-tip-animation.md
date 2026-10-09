---
# hand-sim-hvy5
title: 'Unit 9.18: ScrapBin slide and tip animation'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-10-04T13:30:40Z
updated_at: 2026-10-05T22:49:22Z
parent: hand-sim-rqpy
blocked_by:
    - hand-sim-tz4q
    - hand-sim-2hi0
---

## What to build

Scene: ScrapBin slides toward +X off-scene, tips, returns, following SCRAP exchange state; stays clear of the display panel.

Spec + binding decision log: docs_src/specs/unit9/ (overview.md, implementation_wireframe.md). ADR 0006. Branch: feat/conveyor-devices.

## Acceptance criteria

- [ ] vitest: bin position follows exchange state
- [ ] verify: GREEN

## Blocked by

- hand-sim-tz4q (16)
- hand-sim-2hi0 (17)

ScrapBin slides +X, tips at the outer end, returns, following SCRAP exchange state. SCRAP added to StationName; orchestrator publishes it in cell_state.stations (count = Scrapped). binMotion.ts + bin_motion.test.ts.
