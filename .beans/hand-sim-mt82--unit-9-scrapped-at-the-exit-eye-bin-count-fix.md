---
# hand-sim-mt82
title: 'Unit 9.12: Scrapped at the exit eye (bin count fix)'
status: todo
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-10-04T13:30:39Z
updated_at: 2026-10-04T13:36:34Z
parent: hand-sim-rqpy
blocked_by:
    - hand-sim-xhsn
---

## What to build

A Rejected Gearwheel becomes Scrapped when the exit eye counts it on the next belt run; ScrapBin contents = Scrapped only (fixes counting defectives while still on the belt). WorkcellState gains Scrapped; bin mesh green/red driven by Scrapped.

Spec + binding decision log: support_files/specs/unit9/ (overview.md, implementation_wireframe.md). ADR 0006. Branch: feat/conveyor-devices.

## Acceptance criteria

- [ ] Pytest: Rejected → Scrapped on exit_count delta, order preserved
- [ ] Bin count never includes Rejected
- [ ] verify: GREEN

## Blocked by

- hand-sim-xhsn (10)
