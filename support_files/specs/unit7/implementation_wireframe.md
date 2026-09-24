> [!IMPORTANT]
> Aligns with [units.md](../units.md#unit-7-multi-color-gear-sorting--defect-qc-inspection) and the Unit 7 epic (`hand-sim-u2tx`). In this unit we extend pick-and-place with simulated quality-and-color classification plus four-destination routing: click still places an initially grey Gearwheel, the Gateway classifies the spawn with color (`WHITE`/`GREEN`/`BLUE`) and `intact` (`false` = defective, ~20%) and passes both to Workcell, the authoritative `WorkcellState` persists classification table-to-grasp-to-drop and routes sound gears to their color tower vs `intact == false` gears of any color to the ScrapBin, and TeleopClient recolors on authoritative echo with crack notch, per-tower `n/10` counters, and empty/non-empty bin icon.

Welcome to Unit 7: Multi-Color Gear Sorting & Defect QC Inspection. This unit provides the simulated inspection gate and sorting layer on top of Units 5/6: classification at spawn, four physical destinations in Three.js, and deterministic seeded end-to-end verification.

------------------------------
## Contract-First Parallel Execution Model

Development strictly follows interface boundaries. Once color/intact contracts, tower coordinates, and capacity constants are locked in Unit 7.0, the Workcell service extension (7.1a), Gateway `QcClassifier` plugin (7.2), and Web tower fixtures (7.3a) execute concurrently against mocked seams. Routing (7.1b) follows 7.1a; recolor/counters (7.3b) follow 7.1a+7.2+7.3a; bin fixture (7.3c) follows 7.1b+7.3a; notch (7.3d) and FIFO/Clear (7.3e) follow their web predecessors. Only the final seeded hermetic suite (7.4) depends on all web components.

```
                    ┌────────────────────────────────────────────────────────┐
                    │ Unit 7.0: Domain Contracts — required color + intact (Stage 0)│
                    │ (Wire schemas, scripts/generate_domain.py, tests)      │
                    └───────────────────────────┬────────────────────────────┘
                                                │
         ┌──────────────────┬───────────────────┼───────────────────┬──────────────────┐
         │                  │                   │                   │                  │
         ▼                  ▼                   ▼                   ▼                  ▼
┌─────────────────┐ ┌───────────────┐ ┌──────────────────┐ ┌────────────────┐ ┌───────────────────┐
│ Unit 7.1a: ROS2 │ │ Unit 7.2: GW  │ │ Unit 7.3a: Web   │ │ (routing waits │ │ (recolor waits    │
│ svc extension   │ │ QcClassifier  │ │ tower fixtures   │ │  on 7.1a)      │ │  on 7.1a+7.2+7.3a)│
│ (pytest vs mock)│ │ (cargo nextest│ │ (Vitest fixture) │ │                │ │                   │
└────────┬────────┘ └───────┬───────┘ └────────┬─────────┘ └────────────────┘ └───────────────────┘
         │                  │                  │ 
         ▼                  │                  ▼
┌─────────────────┐         │         ┌────────────────┐      ┌───────────────────┐
│ Unit 7.1b: 4-dest│        │         │ Unit 7.3b:     │      │ Unit 7.3c: Scrap  │
│ routing (pytest)│         │         │ recolor+counter│      │ Bin fixture+icon  │
└────────┬────────┘         │         └────────┬───────┘      └────────┬──────────┘
         │                  │                  │                       │
         └──────────────────┴──────────┬───────┴───────────────────────┘
                                       │
                          ┌────────────┼────────────┐
                          ▼            ▼            ▼
                   ┌───────────┐ ┌───────────┐ ┌────────────────┐
                   │ 7.3d notch│ │ 7.3e FIFO │ │                │
                   │ +infer chan│ │ +Clear all│ │                │
                   └─────┬─────┘ └─────┬─────┘ │                │
                         │             │       │                │
                         └──────┬──────┴───────┘                │
                                │                               │
                                ▼                               │
                   ┌────────────────────────────────────────┐   │
                   │ Unit 7.4: Seeded Hermetic E2E (Final)  │◄──┘
                   │ (Mock Gateway, no randomness)          │
                   └────────────────────────────────────────┘
```

---

## Step 1: Domain Contracts — Required Color + Intact (Unit 7.0, `hand-sim-9kw2`)

Lock down classification fields and destination constants across Python, Rust, and TypeScript before any node logic.

1. **Wire Schemas Update**:
   - `schemas/robot_command.schema.json`, `spawn_object_payload`: carries NO classification.
     TeleopClient spawns blind (`x, y, z, object_type` only, `required` unchanged,
     `additionalProperties: false` preserved). Gateway classifies after validation
     and passes `color` + `intact` to Workcell via `SpawnObject.srv`. Any `color` /
     `intact` key on the spawn wire fails validation.
   - `schemas/robot_telemetry_event.schema.json`, every `GearEntry` (spawned / in_progress / processed):
     add REQUIRED `color` (`WHITE` / `GREEN` / `BLUE`, no default) + REQUIRED `intact`
     (`boolean`, no default; `false` = unsound, routes to ScrapBin). Required becomes
     `["id", "x", "y", "z", "color", "intact"]`. Missing either fails validation —
     no 4th tower, no silent WHITE fallback.
   - `consts` (telemetry schema): lock destination constants —
     `WHITE_TOWER: (0.40, -0.30, 0.0)` (established, unchanged),
     `GREEN_TOWER: (0.55, -0.30, 0.0)`,
     `BLUE_TOWER: (0.70, -0.30, 0.0)`,
     `SCRAP_BIN: (0.40, 0.28, 0.0)`,
     `TOWER_CAPACITY: 10`, `STACK_STEP_M: 0.02`.
     All four sit inside the table slab ($x \in [0.15, 0.95]$, $y \in [-0.30, 0.30]$); towers share the south edge, bin sits alone on the north edge for glance separation. Tower drops use arm IK reach ($R \le 0.85$m), not the click-reticle ring, so BLUE at $R \approx 0.76$m stays reachable.
2. **Code Generation**:
   - Run `python scripts/generate_domain.py` to regenerate:
     - `src/domain/domain.py` (Pydantic models)
     - `src/domain/domain.rs` (Serde models)
     - `web/domain/contracts.ts` (Zod schemas & TypeScript types)
   - Never hand-edit generated types.
3. **Cross-Language TDD Contract Tests**:
   - Python: `pytest tests/test_domain.py` — spawn rejects `color`/`intact`; GearEntry
     round-trips required `color` + `intact` on every bucket; missing either rejected;
     invalid color rejected.
   - Rust: `cargo nextest run -p gateway --test domain_contract_test` — same.
   - Web: `npm --prefix web run test` — same.
   - Pre-7.0 contract tests updated to classified entries (required fields are the assertion).

---

## Step 2: Workcell Service Extension — Persist Classification (Unit 7.1a, `hand-sim-c682`)

Extend `SpawnObject.srv` / `GetDropSlot.srv` request surface and carry classification through all three buckets. Response shapes do not change.

1. **`robot_control_interfaces`**:
   - `SpawnObject.srv` request: add `string color` (REQUIRED, `WHITE`/`GREEN`/`BLUE`) + `bool intact`. Response unchanged (`success, message, gear_id`). Gateway classifies after spawn validation and passes both through; workcell trusts them verbatim (no normalization).
   - `GetDropSlot.srv` request: add same two fields (currently empty request). Response unchanged (`drop_coords, slot_index, overflow_occurred`).
2. **`workcell_node.py`** (`src/ros2/workcell_manager/workcell_manager/workcell_node.py`):
   - `handle_spawn_object`: store `{ id, x, y, z, color, intact }` on the table entry verbatim.
   - `handle_mark_grasped`: copy `color`/`intact` into the in-transit entry with `origin_*` intact.
   - `handle_commit_drop`: copy `color`/`intact` into the processed entry with `origin_*` intact.
   - `get_snapshot` / `_publish_state`: emit new fields over the existing `workcell/state` channel; no cadence change.
3. **TDD Verification (`pytest`)**:
   - Spawn stores classification; grasp preserves it with origin intact; drop commit preserves it with origin intact.
   - Reservation accepts new fields, response shape unchanged.
   - No legacy fallback: spawn carries no classification; every GearEntry must carry both (gateway classifies, workcell stores verbatim).

---

## Step 3: Workcell 4-Destination Routing (Unit 7.1b, `hand-sim-473u`)

Route on the persisted classification. `intact == false` dominates color.

1. **Routing rule** (in `workcell_node.py`, shared by `handle_get_drop_slot` reservation and `handle_commit_drop` commit):
   - `intact == false` (any color) → ScrapBin pile position, `overflow_occurred` never set, pile index increments to a 100-item cap, then wraps to slot 0 (bin recycle).
   - Sound `WHITE`/`GREEN`/`BLUE` → matching tower base + per-tower slot math $z_k = k \times 0.02$m where $k$ = that tower's own fill count; towers independent.
   - WHITE-only with no defects stays byte-identical to today (same coords, same slot math, same FIFO).
2. **TDD Verification (`pytest`)**:
   - Sound gear of each color reserves/commits to its tower coordinates.
   - Per-tower slot height derives from that tower's fill count only.
   - `intact == false` gear of any color reserves/commits to bin pile, overflow never set, positions increment to 100 then wrap to slot 0.

---

## Step 4: Gateway `QcClassifier` Plugin (Unit 7.2, `hand-sim-6n92`)

One-function seam on the spawn path only; pick-and-place path untouched.

1. **Plugin seam** (`src/gateway/src/`, new module e.g. `qc_classifier.rs` + one wiring line in `ws.rs` spawn arm):
   - Trait/interface with one method `classify() -> (Color, intact: bool)`; random stub: uniform `WHITE`/`GREEN`/`BLUE`, ~20% `intact == false`.
   - Spawn path order: validate → classify → pass `color` + `intact` to Workcell via `SpawnObject.srv` → publish classified `GearEntry` on `robot/{id}/telemetry`. Click sends no classification; table gear renders grey until the classified echo.
   - Seeded mock implements the same interface replaying a fixed sequence deterministically (used by 7.4).
   - Swapping stub for a real inspection service = implement interface + one wiring line.
2. **TDD Verification (`cargo nextest`)**:
   - Colors roughly equal over N; ~20 `intact == false` per 100 within tolerance; seeded mock deterministic.
   - Rate limiting, session exclusivity, telemetry handling unchanged.

---

## Step 5: Web Towers, Recolor-on-Echo, Counters, ScrapBin (Units 7.3a–7.3c, `hand-sim-3gmi`/`hand-sim-7839`/`hand-sim-17xk`)

Three towers via the existing builder, grey-until-echo recolor, per-tower counters, bin fixture with binary icon.

1. **Tower fixtures (7.3a)**:
   - Parameterize `createSpindleTower()` (`web/src/components/RobotVisualizer/assets/tower.ts`) by color/position; instantiate 3× at canonical `WHITE`/`GREEN`/`BLUE` coords. No duplicated builder logic.
   - Share capacity constant 10 with counters and workcell math. Single-WHITE scene renders identically to today.
2. **Recolor-on-echo + counters (7.3b)**:
   - Table gear mesh renders grey until the authoritative snapshot echo carries its `id` with classification, then adopts the classified color (match by gear id in `interaction/snapshot.ts` reconciliation).
   - Processed gears render at their tower positions by classification.
   - Counters `White n/10, Green n/10, Blue n/10` derive from the flat `processed` list; pin at 10 on per-tower overflow (display only, no data-flow change).
3. **ScrapBin fixture + binary icon (7.3c)**:
   - New open box/chute fixture at canonical ScrapBin coords with empty vs has-items visual states.
   - Indicator derives empty/non-empty from `processed` list; **no numeric scrap count anywhere** (UI, telemetry display, test assertions beyond presence/absence).
   - First `intact == false` arrival flips icon to non-empty; Clear returns it to empty.
4. **TDD Verification (`vitest`)**: fixture coords, builder reuse, grey→color transition by id, tower-position rendering, counters incl. pin-at-10, icon flip both ways, no-count invariant.

---

## Step 6: Defect Notch, Per-Tower FIFO, Clear All-4 (Units 7.3d–7.3e, `hand-sim-pn7u`/`hand-sim-lilk`)

Notch that survives everything; per-tower eviction; bin cap-100 recycle; Clear wipes all four.

1. **Defect notch + inference channel (7.3d)**:
   - `intact == false` gear mesh carries a visible crack notch (`assets/gear.ts` variant); sound gears show none.
   - Notch survives recolor-on-echo, tower/bin routing, and snapshot reconciliation.
   - Existing inference `detected_object` label carries `WHITE` | `GREEN` | `BLUE` | `DEFECTIVE`; no new channel.
2. **FIFO + Clear (7.3e)**:
   - 11th arrival to one tower evicts that tower's oldest (bottom), shifts rest down one $0.02$m step, counter stays 10; sibling towers unaffected.
   - Bin pile caps at 100; 101st unsound wraps to slot 0 (sharp cut, recycle), overflow never reported; bin icon stays binary empty/filled.
   - `ClearWorkspace` wipes all three towers plus bin, resets every counter, bin icon returns to empty, placement lockout lifts.
3. **TDD Verification (`vitest` + `pytest`)**: notch presence/absence + survival; per-tower eviction isolation; bin cap-100 recycle; clear-to-empty reset incl. icon and lockout.

---

## Step 7: Seeded Hermetic E2E (Unit 7.4, `hand-sim-fuvh`)

Deterministic multi-service suite against the Mock Gateway (Refactor-A.5 harness); no real randomness, never crosses sandbox borders.

1. **Coverage** (seeded classification sequence):
   - Full click grey-to-stack loop and click grey-to-bin loop pass.
   - Per-tower FIFO at 10 and bin icon flip on first `intact == false` arrival covered.
   - Clear-to-empty reset covered.
   - Click-to-echo latency under 50ms asserted.
2. **Harness**: Mock Gateway mirrors the seeded sequence; TeleopClient + workcell logic run hermetically per Refactor-A.5 conventions.
