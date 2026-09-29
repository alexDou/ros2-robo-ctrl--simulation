---
# hand-sim-d04j
title: 'Unit 8: Conveyor Feed Flow (Flow B) — hopper, belt, per-gear sorting'
status: todo
type: epic
tags:
    - ready-for-agent
created_at: 2026-09-28T16:00:03Z
updated_at: 2026-09-28T16:00:03Z
---

> Branch: `feat/conveyor-flow` only (`main` = Flow A click-to-place). Design + binding decision log (Q1–Q32): `support_files/specs/unit8/`. ADR 0005.

## Problem Statement

Visitors of the deployed simulation currently see the click-to-place workflow: they click the WorkcellTable, one Gearwheel appears, the arm sorts it. It demonstrates the pipeline but not a production line. There is no continuous feed, no sense of throughput, and the operator has to drive every single gear by hand. The showcase vision (iter-2 Flow B) is a conveyor-fed sorting cell where the operator loads a supply once and watches the arm sort a stream of gears of mixed color and quality, with defective parts rejected on the line.

## Solution

On a dedicated branch the WorkcellTable is replaced by a Conveyor running across the front of the manipulator, fed from a FeedHopper at its upstream end, with the ScrapBin under its exit and the three SpindleTowers on a RearStand behind the arm. The operator clicks **Fill** to load the FeedHopper with 100 Gearwheels (10% defective, intact gears split evenly across WHITE/GREEN/BLUE), then **Process**. The Conveyor feeds a random Batch of 3..BeltCapacity gears onto the belt, one by one, stops when the lead gear reaches the far edge of the PickZone, and the arm sorts intact gears onto their color SpindleTower one gear at a time. Defective gears stay on the belt and drop into the ScrapBin on the next belt run. This repeats until the FeedHopper is empty, then a final flush clears the belt. **Stop** pauses feeding and resumes later. EmergencyStop, FAULT, reconnect or page reload resets the whole system. Full SpindleTowers empty themselves at 10 with a fade; the ScrapBin shows only empty (green) or not empty (red).

## User Stories

1. As a visitor, I want the scene to show a conveyor, a hopper, a scrap bin at the belt exit and color towers behind the arm, so that I immediately read it as a sorting line.
2. As a visitor, I want the default camera to show the belt, the arm and the rear towers at once, so that I can follow a gear from hopper to tower without orbiting.
3. As an operator, I want a Fill button, so that I can load the FeedHopper with a fresh supply of 100 Gearwheels.
4. As an operator, I want the FeedHopper to visibly fill, so that I know the supply is loaded.
5. As an operator, I want Process disabled until the hopper is filled, so that I cannot start an empty line.
6. As an operator, I want Fill disabled while the line is running or the hopper still holds gears, so that I cannot overfill or disturb a run.
7. As an operator, I want a Process button, so that I can start the line.
8. As a visitor, I want gears to drop onto the moving belt one by one with irregular spacing and lateral position, so that the feed looks natural.
9. As a visitor, I want each belt run to carry between 3 and BeltCapacity gears, so that batches vary.
10. As a visitor, I want the belt to stop when the lead gear reaches the far edge of the PickZone, so that every gear in the Batch is within the arm's reach.
11. As a visitor, I want the arm to pick intact gears one at a time and stack each on the tower of its color, so that I see the sorting.
12. As a visitor, I want defective gears to show a visible crack, so that I can tell why they are not picked.
13. As a visitor, I want defective gears left on the belt and dropped into the ScrapBin when the belt next moves, so that rejection happens on the line without the arm.
14. As an operator, I want the arm to return HOME when a Batch is done and the belt to restart automatically, so that the run continues without input.
15. As an operator, I want the run to continue batch after batch until the FeedHopper is empty, so that one Process click sorts the whole supply.
16. As an operator, I want a final flush run when the hopper is empty, so that no defective gears remain on the belt at the end.
17. As an operator, I want Fill re-enabled and Process disabled after the final flush, so that I can load a new supply.
18. As an operator, I want a Stop button, so that I can pause the line without a fault.
19. As an operator, I want Stop to freeze the belt immediately and let the current pick finish, so that nothing is dropped mid-air.
20. As an operator, I want Process to resume from the next unprocessed gear after a Stop, so that I lose no progress.
21. As an operator, I want EmergencyStop to keep its current meaning (abort motion → FAULT), so that safety behaviour is unchanged.
22. As an operator, I want a FAULT to reset the hopper, belt, towers and bin, so that I restart from a clean, consistent state.
23. As a visitor, I want a page reload or reconnect to reset the whole system, so that I never see stale gears the browser no longer tracks.
24. As a visitor, I want each tower to show a count `n/10`, so that I can see progress per color.
25. As a visitor, I want a tower that reaches 10 gears to fade its stack out and reset to 0 without stopping the arm, so that the run never blocks on a full tower.
26. As a visitor, I want the ScrapBin green when empty and red when it holds anything, so that I read reject status at a glance.
27. As an operator, I want the ScrapBin to empty itself at 100 gears, so that it never overflows.
28. As an operator, I want the supply proportions to be exact (10 defective, 30/30/30 intact) but in random order, so that every run is fair and different.
29. As an operator, I want gears moved on the belt after the stop to be picked where they actually are, so that the line is robust to disturbance.
30. As a developer, I want the gear color and intactness to travel on the SPAWN_OBJECT command, so that the workcell stores exactly what the feed produced.
31. As a developer, I want WorkcellState to be the only authority for registered gears, and the hopper/belt state to live only in TeleopClient, so that no state is owned twice.
32. As a developer, I want a defective gear registered like any other but booked straight into the ScrapBin with no arm motion, so that scrap inventory stays authoritative in the workcell.
33. As a developer, I want every PickZone corner and every rear tower drop proven reachable by IK tests, so that layout changes cannot silently break the arm.
34. As a developer, I want the conveyor controller to accept a seed, so that tests replay deterministic decks and batches.
35. As a developer, I want no click-to-place code (table, mat, raycast, reticle, ClickLockout, Gateway classifier) on this branch, so that exactly one flow exists per branch.
36. As a maintainer, I want the UR5e kept at real dimensions, so that the IK and the LIVE hardware path stay valid.

## Implementation Decisions

- **Branching**: exactly one flow per branch. No `SET_OPERATION_MODE`, no mode toggle. Flow A code is deleted on this branch; shared parts (PickAndPlaceAction, analytical IK, KinematicLinkAttachment, towers, bin) stay.
- **Contract (Stage 0)**: `SPAWN_OBJECT` payload gains required `color` (`WHITE`|`GREEN`|`BLUE`) and required `intact` (boolean); unknown keys still rejected. Tower constants move to the RearStand (X ≈ −0.45, row along Y ≈ −0.26/−0.10/+0.06), ScrapBin constant to the belt exit (Y ≈ −0.75). Changes go through the schemas and the domain generator only; hard-coded coordinate copies are replaced by generated constants.
- **Gateway**: the QC classifier and spawn enrichment are removed; spawn payloads pass through verbatim after schema validation (ADR 0005 relaxes the Unit 7 trust boundary on this branch).
- **EdgeNode**: spawn handling reads `color`/`intact` from the validated payload with no defaults.
- **WorkcellNode**:
  - Spawn with `intact == false` commits directly to ScrapBin inventory; no pick is pending.
  - The commit that brings a tower to `TOWER_CAPACITY` (10) empties it (count → 0); replaces per-tower FIFO eviction. Siblings unaffected.
  - ScrapBin empties at `MAX_SCRAP_BIN_CAPACITY` (100).
  - `CLEAR_WORKSPACE` empties everything.
- **Conveyor controller (TeleopClient, new deep module)**: owns FeedHopper deck, belt kinematics, Batches and ConveyorStatus; nothing of it goes on the wire. Interface: inputs = operator intents (Fill / Process / Stop), clock ticks, telemetry snapshots (RobotState, workcell inventory); outputs = RobotCommands to send, ConveyorStatus, gear poses for rendering, button enablement. Seedable RNG.
  - ConveyorStatus: `EMPTY` → Fill → `LOADED` → Process → `FEEDING` → lead gear at PickZone edge → `HALTED` → (per-gear loop) → Batch done → `FEEDING` … → deck empty → flush → `EMPTY`. Stop from any running state → `STOPPED` → Process resumes. FAULT / connect → local reset + `CLEAR_WORKSPACE`.
  - Per-gear loop at `HALTED`: send `SPAWN_OBJECT(x, y, z, color, intact)`; if intact, send `PICK_AND_PLACE_TARGET` to its tower and wait for `IDLE`; if defective, continue with the next gear.
  - Deck: exactly 10 defective (random color) + 30/30/30 intact, shuffled.
  - Batch size random in 3..BeltCapacity (last may be smaller); random spawn delay; random lateral X; minimum spacing ≈ 0.13 m.
- **Layout** (REP-103, belt top Z = 0): belt X 0.25–0.55 (0.30 m wide), running along Y ≈ +0.95 → −0.66, travel +Y → −Y; PickZone Y −0.51…+0.51 (corners R ≈ 0.75 m); BeltCapacity ≈ 10; FeedHopper at Y ≈ +0.85. All starting values; the PickZone shrinks until the IK reach tests pass. The arm is never scaled.
- **Scene**: new fixtures for Conveyor, FeedHopper and RearStand inside the REP-103 robot group; towers and bin relocated; ScrapBin binary color; tower fade-out (~1.5 s) when a count resets; new default camera on the robot's right side, chosen by screenshot comparison of 3–4 candidates.
- **RobotState is unchanged** (`BOOTING`/`STANDBY`/`IDLE`/`EXECUTING`/`FAULT`); ConveyorStatus is separate.

## Testing Decisions

- Good tests assert external behaviour at a seam (commands sent, state published, what the scene shows), never private helpers or internal call order.
- **E2E via Mock Gateway (primary acceptance)**: Cucumber + Playwright with a seeded deck: full Fill → Process run to empty hopper including flush; Stop mid-batch and resume; EmergencyStop → reset; page reload → reset; tower auto-empty at 10 with fade; bin green → red. Prior art: the existing Cucumber features and Mock Gateway harness (Refactor-A.5/A.6, Unit 7.4).
- **Conveyor controller unit (Vitest)**: fake clock + fake command sender + scripted telemetry; covers deck proportions, button gating, batch bounds, stop rule, per-gear loop incl. wait-for-IDLE, defective skip, Stop/resume, flush, reset on connect/FAULT. Prior art: existing web unit tests for telemetry/session hooks.
- **WorkcellNode services (pytest)**: defective spawn → bin with no pending pick; tower auto-empty at 10 with siblings unaffected; bin empty at 100; clear empties all. Prior art: existing workcell_manager tests for routing and FIFO.
- **Contract + IK (pytest / cargo nextest / vitest)**: SPAWN_OBJECT requires valid `color` + `intact` in all three languages; relocated constants locked; IK solves all PickZone corners at pick and approach heights and all rear tower drops including the top slot. Prior art: domain contract tests and `test_kinematics`.
- Gate: `scripts/verify.sh` must print `verify: GREEN` before every commit.

## Out of Scope

- Any scanner / vision classification (qualities are known when gears enter the belt).
- Physics simulation; all motion stays scripted (KinematicLinkAttachment, animated belt).
- Changes to Flow A on `main`, or porting conveyor features back to it.
- Persisting conveyor state across reloads or reconnects.
- New RobotState values or changes to EmergencyStop semantics.
- Loop rates, telemetry throttling and LIVE hardware configuration.
- `@live` / `test:e2e:live` scenarios.

## Further Notes

- Sub-units: 8.0 contract + constants → 8.1 workcell semantics + IK reach, 8.2 scene, 8.3 conveyor controller (parallel against mocks) → 8.4 seeded E2E.
- Belt numbers (Q18) were accepted by silence; adjust freely if the IK test or the view says so.
- Glossary: see `CONTEXT.md` (Conveyor, FeedHopper, Batch, PickZone, BeltCapacity, ConveyorStatus, Stop, RearStand).
