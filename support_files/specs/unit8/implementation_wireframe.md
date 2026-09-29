> [!IMPORTANT]
> Aligns with [units.md](../units.md#unit-8-conveyor-feed-flow-flow-b) and [iter-2.txt](../../iterations/iter-2.txt) Flow B. Design agreed in a grilling session on 2026-09-28 (decision log Q1–Q32 at the bottom of this file — read it before changing any rule here). Lives **exclusively** on branch `feat/conveyor-flow`; `main` keeps Flow A (click-to-place). ADR: [0005](../../../docs/adr/0005-conveyor-branch-client-owned-feed-and-classification.md).

Welcome to Unit 8: Conveyor Feed Flow. The WorkcellTable is replaced by a Conveyor running across the front of the arm, fed from a FeedHopper; the SpindleTowers move to a rear stand behind the arm. TeleopClient owns the hopper, belt and batches as local state and registers gears one by one into the authoritative WorkcellState when the belt stops.

------------------------------
## Contract-First Parallel Execution Model

Once the spawn classification contract and relocated constants are locked in Unit 8.0, the Workcell semantics (8.1), Three.js scene (8.2) and TeleopClient conveyor controller (8.3) execute concurrently against mocked seams. Only the seeded E2E suite (8.4) depends on all of them.

```
                ┌──────────────────────────────────────────────────────────┐
                │ Unit 8.0: Spawn Classification Contract + Layout Consts  │
                │ (schemas, generate_domain.py, drop QcClassifier, tests)  │
                └────────────────────────────┬─────────────────────────────┘
                                             │
             ┌───────────────────────────────┼───────────────────────────────┐
             ▼                               ▼                               ▼
┌──────────────────────────┐   ┌──────────────────────────┐   ┌──────────────────────────┐
│ Unit 8.1: Workcell       │   │ Unit 8.2: Scene          │   │ Unit 8.3: Conveyor       │
│ defective→bin, tower     │   │ conveyor, hopper, rear   │   │ controller (TeleopClient)│
│ auto-empty, IK reach     │   │ stand, Flow A removal,   │   │ deck, Fill/Process/Stop, │
│ (pytest)                 │   │ bin color, camera (vitest│   │ per-gear loop (vitest)   │
└────────────┬─────────────┘   └────────────┬─────────────┘   └────────────┬─────────────┘
             └───────────────────────────────┼───────────────────────────────┘
                                             ▼
                         ┌────────────────────────────────────────┐
                         │ Unit 8.4: Seeded Hermetic E2E (Final)  │
                         │ (Cucumber + Playwright, Mock Gateway)  │
                         └────────────────────────────────────────┘
```

---

## Step 0: Branching (before any Unit 8 work)

1. Merge `security/semgrep-trust-boundary-fixes` → `main` (local; confirm with user before pushing).
2. Cut `feat/conveyor-flow` off `main`. All Unit 8 work merges **only** there from now on.
3. First commit on the branch: these Unit 8 docs + `units.md` / `iter-2.txt` / `CONTEXT.md` / ADR 0005.
4. No second "click-to-place" branch: `main` *is* Flow A.

---

## Layout (REP-103 `base_link`, belt top at Z = 0)

The UR5e keeps its real dimensions (IK, URDF and the LIVE 500 Hz path depend on them) — the working area is sized to the arm, never the other way round.

| Fixture | Placement | Notes |
|---|---|---|
| Conveyor belt | X 0.25 → 0.55 (0.30 m wide), Y ≈ +0.95 → ≈ −0.66, travel **+Y → −Y** | Replaces WorkcellTable. Inner edge clears the 0.32 m pedestal. |
| PickZone | X 0.25–0.55, Y −0.51 → +0.51 | Corners at R ≈ 0.75 m (< 0.85 IK max, margin for 0.10 m approach lift). |
| BeltCapacity | ≈ 10 gears | Gear Ø ≈ 0.10 m, min centre spacing 0.13 m, ~2 loose lanes. |
| FeedHopper | Upstream end, Y ≈ +0.85 (robot left) | Visual reservoir; fill level reflects deck count. |
| ScrapBin | Under belt exit, Y ≈ −0.75 (camera side), below belt top | Defective gears tip off the belt end into it. |
| Rear stand | ≈ 0.5 × 0.3 m, centred X = −0.45 | Top at Z = 0. Shifted toward camera so towers aren't hidden by the arm at HOME. |
| Towers | X = −0.45, row along Y ≈ −0.26 / −0.10 / +0.06 (WHITE / GREEN / BLUE) | R ≈ 0.45–0.52. |
| Camera | Robot's right side; start REP (0.2, −1.9, 1.4) → target (0.1, 0, 0.1) | Final choice: best of 3–4 candidates by Playwright screenshot (belt, arm, rear stand all visible). **Locked (8.2e): REP (0.6, −2.0, 1.5) → (0.1, 0.05, 0.3)**; the start pose cropped the upright arm. |

All numbers are starting values: shrink the PickZone until the 8.1 IK reach test is green. Update only via `schemas/` consts + codegen; fix hard-coded copies (`web/src/components/RobotVisualizer/constants.ts` `SPINDLE_TOWER_COORDS`, `src/ros2/arm_controller/arm_controller/kinematics/constants.py` `DEFAULT_SPINDLE_TOWER_COORDS`, test literals in `src/ros2/arm_controller/test/test_kinematics.py` and `src/gateway/tests/domain_contract/classification.rs`).

---

## Operational Flow (TeleopClient-driven)

```
EMPTY ──Fill──► LOADED ──Process──► FEEDING ──lead gear at PickZone edge──► HALTED
  ▲                                   ▲                                      │
  │                                   │                                      ▼ per gear:
  │                                   │                     SPAWN_OBJECT(x,y,z,color,intact)
  │                                   │                       ├─ intact  → PICK_AND_PLACE_TARGET → wait IDLE
  │                                   │                       └─ !intact → (workcell → ScrapBin, arm idle)
  │                                   └──── batch done, arm HOME, deck not empty ◄──┘
  └──── deck empty → flush run (leftover defectives fall off) → belt stop, Fill on, Process off
Stop (any running state) → STOPPED: belt freezes, no new picks, current pick finishes; Process resumes.
EmergencyStop / FAULT / page reload / reconnect → full reset: local stores emptied + CLEAR_WORKSPACE.
```

- **Button gating**: Fill enabled only when the hopper is empty and nothing is running; Process disabled until filled; while running, Fill disabled. After Stop with gears left, Fill stays disabled and Process resumes.
- **Deck**: 100 gears generated at Fill: exactly 10 defective (random color) + 30/30/30 intact, shuffled (seedable in tests). Defect rate 10%.
- **Batch**: random size in 3..BeltCapacity (last may be smaller); gears appear one by one with random delay and random lateral X on the moving belt.
- **Registration**: gears become domain state only via `SPAWN_OBJECT` at belt stop, one by one. A gear moved on the belt after the stop is picked where the UI reports it at its turn.
- **ConveyorStatus** (TeleopClient-local, separate from RobotState): `EMPTY` / `LOADED` / `FEEDING` / `HALTED` / `STOPPED`. RobotState is unchanged (`BOOTING`/`STANDBY`/`IDLE`/`EXECUTING`/`FAULT`).

---

## Step 1: Spawn Classification Contract + Layout Constants (Unit 8.0)

1. **Wire schemas**:
   - `schemas/robot_command.schema.json` `spawn_object_payload`: add REQUIRED `color` (`WHITE`/`GREEN`/`BLUE`) + REQUIRED `intact` (boolean); keep `additionalProperties: false`. No `SET_OPERATION_MODE`.
   - `schemas/robot_telemetry_event.schema.json` consts: relocate `WHITE_TOWER` / `GREEN_TOWER` / `BLUE_TOWER` (rear stand) and `SCRAP_BIN` (belt exit); add PickZone / BeltCapacity consts if TeleopClient and tests share them. `TOWER_CAPACITY` 10, `MAX_SCRAP_BIN_CAPACITY` 100 unchanged.
2. **Gateway**: delete `src/gateway/src/qc_classifier.rs` and the enrichment call in `src/gateway/src/ws/mod.rs` spawn arm; spawn payload passes through verbatim after validation. Remove its tests / `[[test]]` entries.
3. **EdgeNode**: `edge_bridge/commands.py` SPAWN_OBJECT reads `color`/`intact` from the validated payload (no `pop` + defaults).
4. **Codegen**: `python3 scripts/generate_domain.py` (never hand-edit `domain.py` / `domain.rs` / `contracts.ts`).
5. **TDD**: Python, Rust (`cargo nextest`), web (`vitest`) contract tests for required/invalid `color` + `intact` and the new consts.

---

## Step 2: Workcell Semantics + Reach (Unit 8.1)

1. **`workcell_node.py`**:
   - Spawn with `intact == false` → commit directly to ScrapBin inventory; no active/pending pick entry. Arm is not commanded.
   - Tower auto-empty: the commit that brings a tower to `TOWER_CAPACITY` (10) empties that tower (count → 0). Replaces the per-tower FIFO eviction in `handle_commit_drop`. Siblings unaffected.
   - Bin auto-empties at `MAX_SCRAP_BIN_CAPACITY` via existing `_recycle_bin_locked`.
   - `CLEAR_WORKSPACE` empties everything (used by connect/FAULT reset).
2. **IK reach tests** (`src/ros2/arm_controller/test/`): all four PickZone corners at pick and approach heights solve; all three rear-stand tower drops (top slot included) solve. Shrink the PickZone / move the stand until green.
3. Read `.agents/rules/telemetry-contract.md` before touching anything crossing Zenoh.

---

## Step 3: Scene (Unit 8.2)

Read `.agents/rules/threejs-rep103.md` first. All fixtures stay inside `robotGroup` (REP-103 coordinates).

1. **Remove Flow A**: `assets/table.ts` (slab + landing mat), `interaction/picking.ts` raycast + reticle, click handlers in `interaction/handlers.ts`, ClickLockout, reach ring, related tests and E2E features.
2. **Add**: `assets/conveyor.ts` (frame, belt surface with scrolling texture/offset, end roller), `assets/hopper.ts` (fill level from deck count), `assets/rearstand.ts`.
3. **Relocate** towers (`assets/tower.ts`) and ScrapBin (`assets/scrapbin.ts`) from consts.
4. **ScrapBin binary color**: green when workcell reports 0, red when ≥ 1.
5. **Tower fade-out**: when a tower count resets to 0, fade its stack out over ~1.5 s (arm does not wait).
6. **Camera**: new default (see Layout); pick via screenshots.

---

## Step 4: Conveyor Controller (Unit 8.3)

TeleopClient-local module (hook/util under `web/src/`, tests in `web/tests/unit/`).

1. Deck generator (seedable): 10 defective (random color) + 30/30/30 intact, shuffled.
2. ConveyorStatus state machine + Fill / Process / Stop buttons and gating (see Operational Flow).
3. Belt kinematics: speed, spawn delays, lateral randomisation, min spacing, stop when the Batch lead gear reaches the PickZone edge; defective leftovers tip into the bin on the next run; final flush.
4. Per-gear command loop: `SPAWN_OBJECT` → (intact) `PICK_AND_PLACE_TARGET` to its tower → wait `IDLE` → next; defective → next immediately.
5. Reset: on connect and on FAULT, empty local stores and send `CLEAR_WORKSPACE`.
6. Telemetry sidebar: tower counters `n/10`, binary bin state; no Flow A controls.

---

## Step 5: Seeded Hermetic E2E (Unit 8.4)

Cucumber + Playwright against the Mock Gateway (`npm --prefix web run test:e2e`), seeded deck, no real randomness:
- Fill → Process full run until hopper empty (flush included).
- Stop mid-batch → resume.
- EmergencyStop → FAULT → full reset.
- Browser reload → full reset.
- Tower auto-empty at 10 with fade; bin green → red.

---

## Decision Log (grilling session 2026-09-28)

| # | Question | Decision |
|---|---|---|
| Q1 | Branch topology | Merge security → `main`; cut `feat/conveyor-flow` from `main`; `main` = Flow A. No second branch. |
| Q2 | Mode toggle / `SET_OPERATION_MODE` | Dropped. Exactly one flow per branch; switch flows by checkout + build. |
| Q3 | Feed model | iter-2 batch fill-then-clear, not one-by-one indexing. `StepIndexingConveyor` retired from the glossary. |
| Q4 | Container | Visible FeedHopper; Fill loads 100 gears. |
| Q5 | Batch size / colors | Random 3..BeltCapacity per belt run; gears appear one by one on the moving belt; colors equiprobable, no guarantees. |
| Q6 | Defectives | Arm picks only intact gears; defectives fall off the belt end into the ScrapBin. |
| Q7 | Colors | WHITE / GREEN / BLUE only — no Red anywhere. |
| Q8 | Table | Conveyor replaces the WorkcellTable; hopper upstream. |
| Q9 | Belt geometry | Along Y, top Z = 0, +Y → −Y; width and PickZone maximised within reach. Arm not scaled. |
| Q10 | Towers | Rear stand at X = −0.45, row along Y. |
| Q11 | Camera | New default, chosen by screenshot comparison. |
| Q12 | Tower full | Auto-empty at 10 with a short fade (replaces FIFO on this branch). |
| Q13 | Defect rate | 10%. |
| Q14 | UI flow | Fill (Process disabled) → Process (Fill disabled) → runs batches until hopper empty → belt stop, arm idle, Fill on, Process off. Stop available. |
| Q15 | State ownership | ONE source of state per concern; gears registered in WorkcellState when the belt stops. |
| Q16 | ConveyorStatus | Separate enum from RobotState. |
| Q17 | FAULT vs Stop | FAULT → reset everything. Stop keeps state and items. |
| Q18 | Belt numbers | 0.30 m × ~1.0 m PickZone, BeltCapacity ≈ 10 (accepted by silence; revisit freely). |
| Q19 | "intact" wording | Defective gears are the ones that fall into the bin. |
| Q20 | Stop vs EmergencyStop | EmergencyStop unchanged (→ FAULT). Separate UI Stop: belt freezes, current pick finishes, Process resumes. |
| Q21/Q26 | Who owns hopper/belt | TeleopClient-local state only; never on the wire; no ConveyorNode. |
| Q22 | Deck proportions | Fixed counts, shuffled: 10 defective (random color) + 30/30/30. |
| Q23 | Run end | Final flush; Fill only when hopper empty; after Stop, Process resumes. |
| Q24 | Tower empty visual | Fade out (~1.5 s). |
| Q25 | Flow A code | Deleted on this branch (table, mat, raycast, reticle, ClickLockout, classifier); kept on `main`. |
| Q27 | Batch vs per-gear | Per gear, UI-driven — robust if a gear is moved on the belt. |
| Q28 | ScrapBin | Binary render: green empty / red non-empty; workcell counts and empties at 100. |
| Q29 | Reload / reconnect / FAULT | Full reset on both sides (`CLEAR_WORKSPACE`). |
| Q30 | Classification source | UI assigns color + intact; Gateway QcClassifier (Flow A) deleted. Reload = system reset. |
| Q31 | Defective registration | Registered one by one like the rest; workcell commits it to scrap at once, arm doesn't move; the gear stays on the belt visually until the next run. |
| Q32 | Stop semantics | Belt freezes, no new picks, in-flight pick completes, Process resumes. UI-only. |
