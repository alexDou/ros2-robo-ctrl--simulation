---
# hand-sim-6n92
title: 'Unit 7.2: Gateway QcClassifier plugin'
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

As a simulation engineer, I want every spawn enriched with a color (WHITE/GREEN/BLUE, equal probability) and a defective flag (roughly 20%) by a one-function plugin seam in the Gateway, so that a real inspection service can later replace the random stub with a one-line wiring change. The click still places an initially grey Gearwheel; classification lands via enrichment before publish. No other Gateway behavior changes.

## Acceptance criteria

- [ ] Spawn path classifies after validation and before publish; pick-and-place path untouched
- [ ] Colors assigned WHITE/GREEN/BLUE with roughly equal probability
- [ ] Roughly 20 defective flags per 100 classifications within tolerance
- [ ] Seeded mock replays a fixed sequence deterministically
- [ ] Swapping stub for another source means implementing the interface + one wiring line
- [ ] Rate limiting, session exclusivity, telemetry handling unchanged

## Blocked by

- hand-sim-9kw2 (Unit 7.0 domain contracts)
