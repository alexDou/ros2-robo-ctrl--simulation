---
# hand-sim-7839
title: 'Unit 7.3b: Web recolor-on-echo + tower counters'
status: todo
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-22T22:22:19Z
updated_at: 2026-09-23T17:30:59Z
parent: hand-sim-u2tx
blocked_by:
    - hand-sim-c682
    - hand-sim-6n92
    - hand-sim-3gmi
---

## Parent

hand-sim-u2tx — Unit 7: Multi-color sorting + defect QC (Gateway plugin, 4 destinations)

## What to build

As an operator, I want the grey table Gearwheel to adopt its classified color when the authoritative echo arrives, and per-tower counters showing fill against capacity, so that I can see what the quality gate decided and how full each tower is.

## Acceptance criteria

- [ ] Table Gearwheel renders grey until authoritative echo, then adopts classified color matched by gear id
- [ ] Processed Gearwheels render at their tower positions by classification
- [ ] Counters show White n/10, Green n/10, Blue n/10 derived from the flat processed list
- [ ] Counter pins at 10 on per-tower overflow, no data-flow change

## Blocked by

- hand-sim-c682 (Unit 7.1a service extension)
- hand-sim-6n92 (Unit 7.2 Gateway plugin)
- hand-sim-3gmi (Unit 7.3a tower fixtures)
