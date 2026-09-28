---
# hand-sim-rmju
title: 'Unit 8.0c: Tracer bullet — one sound gear sorted from the belt to its tower'
status: todo
type: task
tags:
    - ready-for-agent
created_at: 2026-09-28T16:06:03Z
updated_at: 2026-09-28T16:06:03Z
parent: hand-sim-d04j
blocked_by:
    - hand-sim-wie8
    - hand-sim-323x
---

## Parent

hand-sim-d04j (Unit 8 spec)

## What to build

First end-to-end path. `SPAWN_OBJECT` carries required `color` + `intact`; the Gateway QC classifier and spawn enrichment are deleted and the payload passes through verbatim; EdgeNode reads both fields without defaults. A minimal conveyor controller in TeleopClient places one known sound gear in the PickZone on Process, sends spawn → pick-and-place, and the gear lands on its color tower.

## Acceptance criteria

- [ ] Schema requires `color` (WHITE|GREEN|BLUE) + `intact` on SPAWN_OBJECT; cross-language contract tests reject missing/invalid
- [ ] Gateway classifier module and its tests removed; spawn passes through after validation
- [ ] EdgeNode spawn uses payload color/intact, no defaults
- [ ] Minimal controller (Vitest, fake sender) emits SPAWN_OBJECT then PICK_AND_PLACE_TARGET to the right tower
- [ ] E2E (Mock Gateway): one sound gear goes belt → tower
- [ ] `scripts/verify.sh` prints `verify: GREEN`

## Blocked by

- hand-sim-wie8 (02)
- hand-sim-323x (03)

Spec + decision log: `support_files/specs/unit8/`.
