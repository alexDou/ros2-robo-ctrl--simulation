---
# hand-sim-rmju
title: 'Unit 8.0c: Tracer bullet — one intact gear sorted from the belt to its tower'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-28T16:06:03Z
updated_at: 2026-09-29T13:20:55Z
parent: hand-sim-d04j
blocked_by:
    - hand-sim-wie8
    - hand-sim-323x
---

## Parent

hand-sim-d04j (Unit 8 spec)

## What to build

First end-to-end path. `SPAWN_OBJECT` carries required `color` + `intact`; the Gateway QC classifier and spawn enrichment are deleted and the payload passes through verbatim; EdgeNode reads both fields without defaults. A minimal conveyor controller in TeleopClient places one known intact gear in the PickZone on Process, sends spawn → pick-and-place, and the gear lands on its color tower.

## Acceptance criteria

- [ ] Schema requires `color` (WHITE|GREEN|BLUE) + `intact` on SPAWN_OBJECT; cross-language contract tests reject missing/invalid
- [ ] Gateway classifier module and its tests removed; spawn passes through after validation
- [ ] EdgeNode spawn uses payload color/intact, no defaults
- [ ] Minimal controller (Vitest, fake sender) emits SPAWN_OBJECT then PICK_AND_PLACE_TARGET to the right tower
- [ ] E2E (Mock Gateway): one intact gear goes belt → tower
- [ ] `scripts/verify.sh` prints `verify: GREEN`

## Blocked by

- hand-sim-wie8 (02)
- hand-sim-323x (03)

Spec + decision log: `support_files/specs/unit8/`.

Done: spawn requires color+intact (schema/codegen/contract tests in py/rs/ts), Gateway classifier deleted (verbatim pass-through), EdgeNode reads payload fields and no longer auto-dispatches a pick after spawn (user decision: per-gear SPAWN then explicit PICK_AND_PLACE_TARGET; the arm asks the workcell for the active gear's tower). Minimal controller (web/src/utils/conveyorController.ts) + Process button; mock gateway takes classification from the payload; E2E scenario @unit-8.0c. Deferred to later tickets: Fill/Stop state machine and Process gating (8.3), defective-spawn direct scrap (8.1), tower routing asserted only in E2E (workcell picks the drop), local hasActiveGear flag duplicates snapshot state.
