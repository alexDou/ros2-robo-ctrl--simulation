---
# hand-sim-lilk
title: 'Unit 7.3e: Per-tower FIFO + bin cap-100 recycle + Clear all-4'
status: todo
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-22T22:22:24Z
updated_at: 2026-09-24T12:30:56Z
parent: hand-sim-u2tx
blocked_by:
    - hand-sim-473u
    - hand-sim-7839
    - hand-sim-17xk
---

## Parent

hand-sim-u2tx — Unit 7: Multi-color sorting + defect QC (Gateway plugin, 4 destinations)

## What to build

As an operator, I want each tower to evict its oldest bottom Gearwheel when an 11th arrives (counter stays at 10), the bin to pile to a 100-item cap then recycle (101st defective wraps to slot 0), and ClearWorkspace to wipe all four destinations and reset every counter and the bin icon, so that long runs stay bounded and I can always restart cleanly.

## Acceptance criteria

- [ ] 11th arrival to one tower evicts that tower's oldest, shifts rest down, counter stays 10, sibling towers unaffected
- [ ] Bin pile caps at 100; 101st defective wraps to slot 0 (sharp cut, recycle), overflow never reported; bin icon stays binary empty/filled
- [ ] ClearWorkspace wipes all three towers plus bin, resets counters, bin icon returns to empty, placement lockout lifts

## Blocked by

- hand-sim-473u (Unit 7.1b routing)
- hand-sim-7839 (Unit 7.3b recolor-on-echo)
- hand-sim-17xk (Unit 7.3c bin fixture)

Decision 2026-09-24 (groomed): ScrapBin caps at 100 items in WorkcellNode (memory bound + bin-recycling procedure); 101st defective wraps pile to slot 0 — sharp cut, overflow never reported, TeleopClient stays binary empty/filled. Supersedes 'uncapped/unbounded' wording.
