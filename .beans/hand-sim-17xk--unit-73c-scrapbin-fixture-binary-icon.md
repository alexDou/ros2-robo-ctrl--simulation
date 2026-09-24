---
# hand-sim-17xk
title: 'Unit 7.3c: ScrapBin fixture + binary icon'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-22T22:22:19Z
updated_at: 2026-09-24T19:51:03Z
parent: hand-sim-u2tx
blocked_by:
    - hand-sim-473u
    - hand-sim-3gmi
---

## Parent

hand-sim-u2tx — Unit 7: Multi-color sorting + defect QC (Gateway plugin, 4 destinations)

## What to build

As an operator, I want a ScrapBin fixture on the table and an OS-trash-style indicator showing only empty versus non-empty, so that I can tell at a glance whether any rejects exist without ever seeing a scrap count.

## Acceptance criteria

- [ ] Bin fixture (open box/chute) mounted at canonical ScrapBin coordinates with empty and has-items visual states
- [ ] Indicator shows empty versus non-empty derived from processed list; no numeric scrap count anywhere (UI, telemetry display, test assertions beyond presence/absence)
- [ ] Defective arrivals render into the bin pile; first arrival flips icon to non-empty
- [ ] Clearing the workspace returns icon to empty

## Blocked by

- hand-sim-473u (Unit 7.1b routing)
- hand-sim-3gmi (Unit 7.3a tower fixtures)

## Summary of Changes (commit 7e805d0)

ScrapBin fixture at canonical coords, binary empty/non-empty icon, no numeric counts. Defective arrivals render into bin pile, clear returns to empty. Proof: scrapbin.test.tsx green.
