---
# hand-sim-o7w6
title: 'Unit 9.25: orchestrator as one serialized state machine, split into modules'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-10-06T10:38:56Z
updated_at: 2026-10-06T10:53:08Z
parent: hand-sim-rqpy
---

## What to build
Split cell_orchestrator/orchestrator_node.py (827 lines) along its seams: cell model + cell_state publishing, belt runs, SortCycle, station exchanges, flush reset, ROS node shell. Every device result, operator intent and reset step becomes an event applied by a single owner (D33), replacing the run_id guards that drop late results.

## Acceptance criteria
- [ ] No module over ~250 lines; node.py is ROS wiring only
- [ ] A device fault during work that Stop or Reset lets finish still ends in FAULT, freeze and a DEVICE_FAULT frame (review finding c1)
- [ ] Flush reset decides the bin exchange from device results (flush exit count), not the async workcell/state snapshot (review finding c3)
- [ ] Regression tests for both races; all existing orchestrator tests green
- [ ] verify: GREEN

Spec + binding decision log: docs_src/specs/unit9/ (D30–D34 added 2026-10-06 after the code review of 194b7ad..507f20b). ADR 0006. Branch: feat/conveyor-devices.

## Summary of Changes

orchestrator_node.py (827 lines) split into cell_model (state + snapshot), ports (every ROS client; cancel-before-accept is remembered), event_loop (one writer thread), cell (the state machine, ~300 lines: one transition table kept together on purpose), sort_cycle, flush_reset (DRAIN → FLUSH → EXCHANGE step machine) and a thin node shell.
- Results are matched to their operation by kind (one belt run, one SortCycle, one exchange per station in flight); no run_id, so no result is dropped. Any device fault ends in FAULT + freeze + DEVICE_FAULT frame, also after Stop or during Reset (c1).
- Station counts come from CommitDrop.slot_index and ScrapRejected.scrapped; the workcell/state subscription is gone, so the flush's own exit count decides the bin exchange (c3).
- Side effect toward hand-sim-miaq: Process after Stop now waits for the bin and chooses feed run vs final flush (c2), tested here.
- Tests: 58 orchestrator tests (5 new race regressions); fixed a latent fake-release race in the Stop/resume tests. verify: GREEN.
