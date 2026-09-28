# 0005. Conveyor Branch: One Flow per Branch, TeleopClient-Owned Feed and Classification

## Status
Accepted (2026-09-28). Applies to branch `feat/conveyor-flow` only; `main` keeps Flow A.

## Context
Unit 8 delivers iter-2 Flow B (FeedHopper → Conveyor → per-gear sorting). The original plan kept both flows in one codebase behind a `SET_OPERATION_MODE` runtime toggle, fed the conveyor from EdgeNode, and kept the Unit 7 Gateway `QcClassifier` assigning color/soundness on every spawn so the browser was never trusted with classification. Alternatives weighed: a runtime mode toggle vs a branch per flow; a new ROS2 `ConveyorNode` owning hopper and belt vs WorkcellNode owning it vs TeleopClient owning it; Gateway classification vs UI classification; one batch command vs per-gear commands.

## Decision
1. **One flow per branch.** `main` = Flow A (click-to-place); `feat/conveyor-flow` = Flow B. No mode toggle; Flow A code (table, raycast, reticle, ClickLockout, Gateway classifier) is deleted on the conveyor branch.
2. **FeedHopper, belt and Batches are TeleopClient-local state.** They never cross the wire and no ROS2 node models them. A Gearwheel becomes domain state only when TeleopClient registers it with `SPAWN_OBJECT` at a stopped Conveyor; from then on WorkcellState is its only authority. No state is owned twice.
3. **Classification is UI-assigned.** `SPAWN_OBJECT` carries required `color` + `intact`; the Gateway validates and passes them through. The deck is generated at Fill (10 defective, 30/30/30 sound, shuffled).
4. **Per-gear dispatch, driven by TeleopClient** (spawn → pick → wait IDLE → next), not a batch command, so a gear moved on the belt is picked where it actually is.
5. **Reload, reconnect or FAULT resets the whole system**: TeleopClient empties its stores and sends `CLEAR_WORKSPACE`.

## Consequences
- The Unit 7 trust boundary (browser never classifies) is intentionally relaxed on this branch; this is a showcase with no scanner, and classification is part of the simulated feed. Re-introducing a scanner later means a new classifier seam, not reviving this one.
- Conveyor state is lost on reload by design; there is nothing to reconcile with the backend.
- Flow A fixes after the split must be ported to the conveyor branch by hand where shared code is touched.
