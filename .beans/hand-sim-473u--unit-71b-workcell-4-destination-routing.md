---
# hand-sim-473u
title: 'Unit 7.1b: Workcell 4-destination routing'
status: todo
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-22T22:22:06Z
updated_at: 2026-09-23T17:30:59Z
parent: hand-sim-u2tx
blocked_by:
    - hand-sim-c682
---

## Parent

hand-sim-u2tx — Unit 7: Multi-color sorting + defect QC (Gateway plugin, 4 destinations)

## What to build

As an operator, I want sound Gearwheels to land on the SpindleTower matching their color and defective ones to land in the ScrapBin regardless of color, so that good stacks stay pure and rejects never contaminate them. Defective flag dominates color. Each tower stacks with unchanged slot math from its own fill count; the bin piles unbounded with overflow never reported.

## Acceptance criteria

- [ ] Sound WHITE/GREEN/BLUE Gearwheel reserves and commits to its matching tower coordinates
- [ ] Slot height per tower derived from that tower's own fill count (index times step), towers independent
- [ ] Defective Gearwheel of any color reserves and commits to ScrapBin pile position, overflow never set
- [ ] Bin pile positions increment without cap
- [ ] Single-tower behavior for WHITE with no defects is byte-identical to today

## Blocked by

- Workcell service extension ticket (Unit 7.1a, created just above)
