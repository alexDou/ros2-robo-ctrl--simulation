---
# hand-sim-pn7u
title: 'Unit 7.3d: Defect notch + detected_object'
status: todo
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-22T22:22:24Z
updated_at: 2026-09-23T17:30:59Z
parent: hand-sim-u2tx
blocked_by:
    - hand-sim-6n92
    - hand-sim-7839
    - hand-sim-17xk
---

## Parent

hand-sim-u2tx — Unit 7: Multi-color sorting + defect QC (Gateway plugin, 4 destinations)

## What to build

As an operator, I want defective Gearwheels to show a visible crack notch and the classification outcome reported through the existing inference channel, so that I can tell at a glance why a Gearwheel went to scrap.

## Acceptance criteria

- [ ] Defective Gearwheel renders a crack notch; sound Gearwheels show none
- [ ] Notch survives recolor-on-echo, tower/bin routing, and snapshot reconciliation
- [ ] Existing inference detected-object label carries WHITE, GREEN, BLUE, or DEFECTIVE; no new channel

## Blocked by

- hand-sim-6n92 (Unit 7.2 Gateway plugin)
- hand-sim-7839 (Unit 7.3b recolor-on-echo)
- hand-sim-17xk (Unit 7.3c bin fixture)
