---
# hand-sim-qdnj
title: 'unit 6.7.2 arm: id-free reservation-only drop slot'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-21T18:09:32Z
updated_at: 2026-09-21T21:15:41Z
parent: hand-sim-cf7y
blocked_by:
    - hand-sim-1n85
---

PickAndPlace.action goal unchanged (no gear_id). GetDropSlot call reservation-only. 2s spin loop -> add_done_callback chain, failure aborts goal. Phase emission unchanged.
