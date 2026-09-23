---
# hand-sim-3gmi
title: 'Unit 7.3a: Web tower fixtures + constants'
status: todo
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-22T22:22:12Z
updated_at: 2026-09-23T17:30:59Z
parent: hand-sim-u2tx
blocked_by:
    - hand-sim-9kw2
---

## Parent

hand-sim-u2tx — Unit 7: Multi-color sorting + defect QC (Gateway plugin, 4 destinations)

## What to build

As an operator, I want three color SpindleTowers standing on the table at their canonical positions, so that sorted Gearwheels have visible per-color destinations. The existing tower builder is parameterized by color and instantiated three times; capacity constant is 10 per tower.

## Acceptance criteria

- [ ] Three towers mounted at canonical WHITE/GREEN/BLUE coordinates
- [ ] Tower builder parameterized by color, no duplicated builder logic
- [ ] Capacity constant 10 per tower shared with counters and workcell math
- [ ] Existing single-tower scene renders identically when only WHITE is used

## Blocked by

- hand-sim-9kw2 (Unit 7.0 domain contracts)
