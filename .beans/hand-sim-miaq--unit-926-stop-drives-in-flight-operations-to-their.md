---
# hand-sim-miaq
title: 'Unit 9.26: Stop drives in-flight operations to their end; Process resumes correctly'
status: todo
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-10-06T10:38:56Z
updated_at: 2026-10-06T10:39:12Z
parent: hand-sim-rqpy
blocked_by:
    - hand-sim-o7w6
---

## What to build
D30: Stop disables the FlexFeeder at once but lets a RUN_TO_PICKZONE run reach the eye (Batch registered, not sorted) and a final FLUSH run out. In-flight SortCycle/exchanges complete. Process after Stop sorts a registered Batch first, waits for the bin HOME, then chooses RUN_TO_PICKZONE or FLUSH by the post-Batch rule (review finding c2).

## Acceptance criteria
- [ ] Stop while FEEDING: belt reaches the eye, status STOPPED, Batch pending
- [ ] Stop during final FLUSH: flush completes, EMPTY
- [ ] Stop during BinExchange then Process: no HELD_BIN_AWAY fault
- [ ] Stop at end of deck then Process: FLUSH, not a stuck RUN_TO_PICKZONE
- [ ] Web mock gateway and gating follow the new Stop
- [ ] verify: GREEN

Spec + binding decision log: support_files/specs/unit9/ (D30–D34 added 2026-10-06 after the code review of 194b7ad..507f20b). ADR 0006. Branch: feat/conveyor-devices.
