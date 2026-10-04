---
# hand-sim-tz4q
title: 'Unit 9.16: PalletLanes and Pallet exchange animation'
status: todo
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-10-04T13:30:40Z
updated_at: 2026-10-04T13:36:35Z
parent: hand-sim-rqpy
blocked_by:
    - hand-sim-q2ur
    - hand-sim-kmyv
---

## What to build

Scene: PalletLanes from each PalletStation along −X; the Pallet slides off-scene and back following station exchange state, animated with nominal durations. Old tower fade removed.

Spec + binding decision log: support_files/specs/unit9/ (overview.md, implementation_wireframe.md). ADR 0006. Branch: feat/conveyor-devices.

## Acceptance criteria

- [ ] vitest: Pallet position follows exchange state
- [ ] Screenshot check: lanes visible
- [ ] verify: GREEN

## Blocked by

- hand-sim-q2ur (11)
- hand-sim-kmyv (15)
