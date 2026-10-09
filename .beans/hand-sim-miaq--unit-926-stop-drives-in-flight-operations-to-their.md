---
# hand-sim-miaq
title: 'Unit 9.26: Stop drives in-flight operations to their end; Process resumes correctly'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-10-06T10:38:56Z
updated_at: 2026-10-06T11:05:32Z
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

Spec + binding decision log: docs_src/specs/unit9/ (D30–D34 added 2026-10-06 after the code review of 194b7ad..507f20b). ADR 0006. Branch: feat/conveyor-devices.

## Summary of Changes

- New belt command FINISH_RUN (register map belt_cmd 4) in BeltSim/virtual_plc: placing stops at once; a feed run carries what is upstream of the eye on to it, or ends at once (STOPPED_AT_EYE) when nothing is; a flush runs out. Decided in the controller in one tick, so ENABLE/RUN/DISABLE write order cannot matter.
- ConveyorFinish.srv + conveyor/finish on ConveyorNode: marks the active run; its own loop sends FINISH_RUN after its RUN, so a Stop that arrives first is never lost. The orchestrator sends it only once the goal is accepted (deferred otherwise).
- Cell.stop: feeder disabled, run finishes; a Batch it brings is registered, not sorted; Process sorts it, then feeds. Stop during the final flush → EMPTY. Process after Stop waits for the bin / picks the final flush (landed in o7w6).
- Web mock cell follows D30; scenario renamed. Tests: belt sim ×3, conveyor node, orchestrator ×5, edge-bridge integration. E2E 16/16. verify: GREEN.
