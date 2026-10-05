---
# hand-sim-tz4q
title: 'Unit 9.16: PalletLanes and Pallet exchange animation'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-10-04T13:30:40Z
updated_at: 2026-10-05T17:02:22Z
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

Done: PalletLanes (roller lanes from each PalletStation along -X), Pallet + stack slide off-scene and back following cell_state.stations (nominal 2/2/2 s legs, FAULT freezes), stack hidden while AWAY/RETURNING. Old tower fade (TOWER_FADE_MS, snapshot fading map, tower_fade test) removed: the Pallet carries the stack away, ResetStation clears it after return. vitest: pallet_motion + pallet_lanes. Screenshot confirms three lanes visible. Mock gateway does not emit stations yet, so the Pallet stays at its station in web E2E.
