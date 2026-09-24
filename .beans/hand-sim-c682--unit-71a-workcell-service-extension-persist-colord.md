---
# hand-sim-c682
title: 'Unit 7.1a: Workcell service extension — persist color/defect'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-22T22:22:06Z
updated_at: 2026-09-24T12:59:26Z
parent: hand-sim-u2tx
blocked_by:
    - hand-sim-9kw2
---

## Parent

hand-sim-u2tx — Unit 7: Multi-color sorting + defect QC (Gateway plugin, 4 destinations)

## What to build

As an operator, I want spawned Gearwheels to remember their classification from table through grasp to drop, so that routing later acts on the right color and defect state. Extend the spawn and drop-slot reservation requests with color plus defective flag (WHITE/false defaults keep old callers working); the drop-slot response shape does not change. The authoritative snapshot carries the new fields over the existing channel with no cadence change.

## Acceptance criteria

- [ ] Spawn request accepts color + defective flag; stored table entry preserves them
- [ ] Grasp preserves classification from table entry into in-transit entry with origin intact
- [ ] Drop commit preserves classification into the processed entry with origin intact
- [ ] Drop-slot reservation accepts color + defective flag; response shape unchanged
- [ ] Old callers omitting new fields behave exactly as today (WHITE, not-defective)
- [ ] Authoritative snapshot carries new fields; no channel or cadence change

## Blocked by

- hand-sim-9kw2 (Unit 7.0 domain contracts)

## Summary of Changes

Unit 7.1a done (commit 82cc6b1, ancestor of HEAD). Spawn + GetDropSlot requests gain color WHITE default + defective false default; response shape unchanged. WorkcellNode persists color/intact table->grasp->commit with origin intact; invalid color rejected; snapshot carries fields over existing 1 Hz channel. EdgeBridge forwards classification on spawn path. Tests: 7 classification tests green; workcell/arm/cargo suites green.
