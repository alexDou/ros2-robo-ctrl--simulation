> [!IMPORTANT]
> Aligns with [units.md](../units.md#unit-9-conveyor-devices) and [overview.md](overview.md). Design agreed in a grilling session on 2026-10-04 (the decision log at the bottom of this file is binding; read it before changing any rule here and don't re-ask settled questions). Lives **exclusively** on branch `feat/conveyor-devices`, cut from `feat/conveyor-flow`. ADR: [0006](../../../docs/adr/0006-ros2-owned-conveyor-devices-and-field-io.md), which supersedes ADR 0005 §2–§5 on this branch.

Welcome to Unit 9: Conveyor Devices. Every moving part of the Flow B cell becomes a ROS2-managed device modelled on purchasable hardware: FlexFeeder, Conveyor, three PalletLanes and the ScrapBin exchange. A `cell_orchestrator` node owns the flow. In SIM, a `virtual_plc` serves the same Modbus TCP register map a real cell controller would. TeleopClient becomes operator panel + visualizer.

------------------------------
## Contract-First Parallel Execution Model

```
                ┌──────────────────────────────────────────────────────────┐
                │ Unit 9.0: Contracts                                      │
                │ schemas (CELL_*, cell_state, Rejected/Scrapped, consts), │
                │ ROS interfaces, register map, codegen, contract tests    │
                └────────────────────────────┬─────────────────────────────┘
       ┌──────────────────────┬──────────────┼───────────────┬──────────────────────┐
       ▼                      ▼              ▼               ▼                      │
┌──────────────┐   ┌────────────────────┐ ┌──────────────┐ ┌──────────────────────┐ │
│ 9.1 Devices  │   │ 9.2 Orchestrator + │ │ 9.3 Gateway  │ │ 9.4 TeleopClient +   │ │
│ nodes,       │   │ WorkcellNode +     │ │ pass-through │ │ scene, panel,        │ │
│ FieldIoPort, │   │ EdgeNode mapping   │ │ (nextest)    │ │ reset on connect     │ │
│ virtual_plc  │   │ (pytest, fakes)    │ │              │ │ (vitest)             │ │
└──────┬───────┘   └─────────┬──────────┘ └──────┬───────┘ └──────────┬───────────┘ │
       └─────────────────────┴─────────┬─────────┴────────────────────┘             │
                                       ▼                                            │
                   ┌──────────────────────────────────────────┐                     │
                   │ 9.5 Integration: seeded mock-gateway E2E │◄────────────────────┘
                   │ (web only) + ROS launch test (SIM graph) │
                   └──────────────────────────────────────────┘
```

---

## Step 0: Branching

1. `feat/conveyor-devices` is cut from `feat/conveyor-flow` (done 2026-10-04).
2. First commit: these Unit 9 docs + `units.md` + `CONTEXT.md` + ADR 0006 + the AGENTS.md pointer.
3. `feat/conveyor-flow` and `main` are untouched by Unit 9.

---

## Devices (real-world reference hardware)

| Function | Reference device class | Reaches ROS2 via |
|---|---|---|
| Cell controller | Programmable controller with a Modbus TCP server, DI/DO and counter modules (WAGO PFC200 / CODESYS class) | Modbus TCP (`pymodbus`, apt `python3-pymodbus`) |
| Conveyor | Cobot-cell belt conveyor (Dorner 2200 class); gearmotor on a VFD (SINAMICS G120C / ABB ACS380) or BLDC package (Oriental Motor BLV-R); encoder; photo-eye at the downstream PickZone edge; photo-eye at the belt exit | Drive hardwired (run / ready / fault, preset speed) or via fieldbus to the controller. Eyes + encoder into the controller |
| FlexFeeder | Flexible-feeder module: bulk hopper + 3-axis vibration plate + vision + its own picker placing singulated Gearwheels on the belt (RNA FlexType P = BVL-P + FlexCube + EYE+) | Module controller over Modbus TCP (FlexCube supports Modbus TCP / EtherNet/IP / EtherCAT). The contract below is integrator-defined |
| PalletLane ×3 | 24 V motor-driven roller lane (Interroll RollerDrive EC5000 + MultiControl class), reversible; stop gate; pallet-present sensors at the PalletStation and the remote end; Pallet with a 2 × 5 nest tray (10 Gearwheels, one per pocket; D38, was a single-rod stacking Pallet) | Direction / run / sensors through the controller |
| ScrapBin exchange | Pneumatic rodless slide with guide (Festo DGC-K / SMC MY1) + rotary tipper at the outer end (Festo DSM / SMC CRB); end sensors on slide and tipper | Valves + sensors on the controller |
| Safety (LIVE) | Hardwired E-stop chain: safety relay (PILZ PNOZ class), STO on the belt drive, pneumatics dump, UR safety I/O | Not software. Software `EMERGENCY_STOP` only freezes |

Drive ramps, belt speed (single preset) and exchange durations are **commissioning parameters**, not operator controls.

---

## Layout (REP-103 `base_link`, belt top at Z = 0)

Unit 8 layout stays unless listed. The UR5e is never scaled.

| Fixture | Placement | Notes |
|---|---|---|
| Conveyor | Unchanged: X 0.25 → 0.55, Y ≈ +0.95 → ≈ −0.66, travel +Y → −Y | PickZone eye at the downstream PickZone edge (Y ≈ −0.51); exit eye at the belt end |
| FlexFeeder | Upstream end of the belt (the Unit 8 hopper spot, Y ≈ +0.85) | Placements land on the belt at the feeder's Y |
| PalletStations | Tray centres X = −0.415, Y −0.29 / −0.04 / +0.21 (WHITE / GREEN / BLUE), 0.25 m pitch (D38; was the Unit 8 tower spots at X −0.45, 0.16 m pitch) | 2 × 5 nest tray, pocket pitch 0.105 m. Every pocket is reach-tested from the whole real pick band, including the braked lead at y ≈ −0.555 |
| PalletLanes | From each PalletStation along −X, off-scene | Pallet leaves −X, returns to the PalletStation |
| ScrapBin | HOME under the belt exit (Y ≈ −0.75) | BinExchange slides it toward +X off-scene, tips, returns |
| Counters overlay | Top-right corner of the scene (DOM overlay) | Replaced the post-mounted display panel (D25). Shows FlexFeeder remaining, ScrapBin count, Pallet counts n/10 |
| Camera | Unchanged (Unit 8.2e lock) | Re-check by screenshot that lanes, panel and bin path are visible |

All coordinates go through `schemas/` constants + codegen; no hard-coded copies.

---

## Cell Controller Register Map (provisional; locked in 9.0)

Rules: every command word has a matching sequence register, and the controller echoes the last executed sequence in status (`ack_seq`). Counters are latched and wrap at 16 bit. Placement records go in a 16-entry ring buffer. All lengths are in mm, and the encoder is a 32-bit count with a counts-per-mm parameter.

| Block | Holding registers (ROS → controller) | Input registers (controller → ROS) |
|---|---|---|
| Conveyor | `belt_cmd` (0 NONE, 1 RUN_TO_PICKZONE, 2 FLUSH, 3 STOP, 4 FINISH_RUN), `belt_seq` | `belt_state` (IDLE, RUNNING, STOPPED_AT_EYE, FLUSH_DONE, HELD_BIN_AWAY, FAULT), `belt_ack_seq`, `encoder_hi/lo`, `exit_count`, `belt_fault` |
| FlexFeeder | `feeder_cmd` (0 NONE, 1 ENABLE, 2 DISABLE, 3 FILL, 4 QUICK_EMPTY), `feeder_seq`, `fill_seed` (SIM only) | `feeder_state` (EMPTY, READY, PLACING, EMPTYING, FAULT), `feeder_ack_seq`, `remaining`, `placement_count`, ring buffer of {`seq`, `lateral_x_mm`, `encoder_hi/lo`, `color`, `intact`}, `feeder_fault` |
| Station k (WHITE, GREEN, BLUE, SCRAP) | `station_cmd` (0 NONE, 1 EXCHANGE), `station_seq` | `station_state` (HOME, LEAVING, AWAY, RETURNING, FAULT), `station_ack_seq`, `station_fault` |
| Cell | `cell_cmd` (1 FREEZE, 2 RELEASE_FREEZE, 3 FAULT_ACK), `cell_seq` | `cell_ack_seq`, `interlocks` bitfield (bin_home, feeder_ok, drives_ok, estop_chain_ok) |

**Controller-local logic** (real controller and `virtual_plc` alike):
- Belt stops at the PickZone eye in RUN_TO_PICKZONE, ramped by the drive.
- FINISH_RUN (Stop, D30): placing stops at once; a feed run carries what is upstream of the eye on to it, or ends at once (STOPPED_AT_EYE) when nothing is; a flush runs out.
- A feed run whose FlexFeeder is EMPTY ends the same way: nothing more can arrive, so it never runs on (a run may be sent on a stale `remaining`).
- The controller scans every few ms: an item never passes an eye between two scans. The Batch at an eye stop includes the lead that braked a little past the PickZone edge.
- FlexFeeder placement is allowed only while the belt runs, and only once ≥ 130 mm of encoder travel has passed since the last placement. The feeder is disabled at the eye stop.
- The exit eye increments `exit_count`.
- The belt refuses RUN and FLUSH while SCRAP is not HOME (`HELD_BIN_AWAY`).
- The Pallet stop gate is held at the PalletStation unless EXCHANGE.
- An end sensor not reached within its timeout → station FAULT.
- FREEZE stops every drive and valve motion immediately.
- FAULT_ACK clears latched drive, FlexFeeder and station faults; a faulted station drives back HOME (reference run). The flush reset after a FAULT releases the freeze and acknowledges before anything else moves.
- `interlocks`: a bit that drops is a device fault for the orchestrator (drives_ok → conveyor, estop_chain_ok → safety); the FlexFeeder reports its own FAULT with a code.
- The Pallet stop gate is implicit in the station machine: a Pallet leaves its PalletStation only on EXCHANGE.

---

## State Machines

### ConveyorStatus (owned by `cell_orchestrator`)
```
EMPTY ──CELL_FILL──► LOADED ──CELL_PROCESS──► FEEDING ──eye stop──► HALTED ──Batch sorted, arm HOME,──► FEEDING
  ▲                                              ▲                     │      bin HOME, feeder not empty
  │                                              │                     │
  │                                              └─────CELL_PROCESS────┤◄── STOPPED (CELL_STOP: feeder stops
  │                                                                    │    placing; every in-flight operation
  │                                                                    │    runs to its end, see D30)
  └── final flush done ◄── feeder empty + last Batch sorted ◄──────────┘
any ──device fault──► FAULT ──RESET_FAULT──► RESETTING
any ──EMERGENCY_STOP──► FAULT (everything frozen where it is, arm included; Gateway closes the session) ──reconnect──► RESETTING
any ──CLEAR_WORKSPACE (sent on every connect)──► RESETTING ──flush done──► EMPTY
```
- At every eye stop:
  1. Register the Batch: intact → pickable (defectives were registered Rejected at placement, D35).
  2. If Scrapped ≥ `BIN_EXCHANGE_THRESHOLD` (20), start the BinExchange.
  3. Run SortCycles in belt order.
- Button gating: Fill only in `EMPTY`; Process in `LOADED` and `STOPPED`; Stop in `FEEDING` and `HALTED`. Everything is disabled in `RESETTING` and `FAULT`.

### SortCycle
```
dispatch(lead pickable Gearwheel) → PickAndPlace(drop = its colour's PalletStation) → commit drop
   ├─ Pallet count < 10 → done
   └─ Pallet count = 10 (FULL) → [arm HOME ‖ PalletExchange] → ResetStation(colour) → done
next SortCycle starts only after done
```

### Station exchange (PalletLane ×3 and ScrapBin, one machine)
`HOME → LEAVING → AWAY (Pallet unloaded by the next line / bin tipped) → RETURNING → HOME`; any timeout → `FAULT`. PalletExchange and BinExchange are independent and may overlap.

### Defective Gearwheel lifecycle
`placed → Rejected (registered at placement, rides past the PickZone eye) → Scrapped (exit eye counted it, on whichever run carries it off)` (D35). Only Scrapped counts as ScrapBin contents.

### Flush reset (`RESETTING`)
1. Arm: a SortCycle still in flight completes (Gearwheel on its Pallet, arm HOME). An arm frozen by EmergencyStop resumes from where it stopped: a Gearwheel held by the DexterousPalm is finished onto its colour's Pallet, then the arm goes HOME (D32). Running exchanges complete first (D33).
2. FlexFeeder QUICK_EMPTY.
3. Belt FLUSH. Everything goes to the bin, intact Gearwheels included.
4. EXCHANGE every Pallet with count > 0, and SCRAP if the bin is non-empty.
5. WorkcellNode ClearWorkspace.
6. → `EMPTY`.

The same steps run in SIM and LIVE; only the timings differ.

---

## Step 1: Contracts (Unit 9.0)

1. `schemas/robot_command.schema.json`: add `CELL_FILL`, `CELL_PROCESS`, `CELL_STOP` (empty payloads). `CLEAR_WORKSPACE` stays and now means the flush reset.
2. `schemas/robot_telemetry_event.schema.json`:
   - `cell_state`: `conveyor_status` (enum above), `feeder_remaining`, `belt_offset_m`, `belt_gears[]` (id, x, y, color, intact), `stations[]` (name, exchange state, count).
   - WorkcellState gains Rejected and Scrapped.
   - Constants: `PALLET_CAPACITY` 10 (was `TOWER_CAPACITY`), `BIN_EXCHANGE_THRESHOLD` 20 (was `MAX_SCRAP_BIN_CAPACITY` 100), and PalletStation / lane / panel / bin-path constants.
3. `robot_control_interfaces`: actions for the conveyor run and the station exchange; services for FlexFeeder fill / enable / quick-empty, ResetStation, orchestrator Fill / Process / Stop / Reset.
4. Register map as a versioned constant table that device nodes and `virtual_plc` share.
5. `python3 scripts/generate_domain.py`. Cross-language contract tests (Python, Rust, TS). Fix hard-coded copies of the renamed constants.

## Step 2: Device Nodes + virtual_plc (Unit 9.1)

1. New Python package (layout per `.agents/rules/structure.md`, tests in its `test/`): conveyor node, FlexFeeder node, station node (×4 via parameters), `FieldIoPort` + Modbus TCP adapter, `virtual_plc`.
2. `virtual_plc` simulates belt motion with ramps, the encoder, both eyes, FlexFeeder placements (variable cycle time, seeded deck at FILL), lane and bin strokes with nominal durations (PalletExchange ≈ 6 s, BinExchange ≈ 8 s), and all controller-local logic.
3. Poll the controller at 5 Hz; read latched counters and ring buffers by sequence.
4. Launch: a `virtual_plc` on/off + controller host/port argument beside `use_fake_hardware`.
5. Prerequisite: `python3-pymodbus` installed.

## Step 3: Orchestrator + WorkcellNode + EdgeNode (Unit 9.2)

1. `cell_orchestrator`: ConveyorStatus, Batch registration, SortCycles, exchanges, Stop, FAULT, flush reset. Publishes `/cell/state` (JSON `std_msgs/String`, validated by generated models) on every event, plus belt offset at 5 Hz while moving.
2. WorkcellNode:
   - PalletStation FULL at 10 (no auto-empty);
   - ResetStation;
   - Rejected / Scrapped buckets, with Scrapped booked on exit-eye events;
   - no bin auto-recycle at 100.
3. EdgeNode:
   - map `CELL_*`, `CLEAR_WORKSPACE` and `RESET_FAULT` onto orchestrator services;
   - EmergencyStop also FREEZEs the devices;
   - forward `/cell/state` into telemetry as it does `/workcell/state`.
4. Read `.agents/rules/telemetry-contract.md` first.

## Step 4: Gateway (Unit 9.3)

Validate and pass through the new commands and `cell_state`. The rate limiter is unchanged. The TelemetryThrottler sample-hold keeps the latest `cell_state`. Every new test file gets its own `[[test]]` entry.

## Step 5: TeleopClient + Scene (Unit 9.4)

Read `.agents/rules/threejs-rep103.md` first.
1. Delete the deck, sequencer and belt physics. `useConveyor` becomes intents + derived gating from `cell_state`.
2. Send `CLEAR_WORKSPACE` on every connect.
3. Scene:
   - FlexFeeder module;
   - belt Gearwheels from `cell_state`, extrapolated between updates;
   - Rejected Gearwheels ride the belt;
   - PalletLanes + Pallets (−X off-scene and back);
   - ScrapBin slide +X with tip;
   - display panel (canvas-texture text).
   - The bin mesh keeps green / red.

## Step 6: Integration (Unit 9.5)

- Seeded mock-gateway Cucumber suite (web only): full run, Stop / resume, EmergencyStop → RESETTING → EMPTY, reload → RESETTING → EMPTY, PalletExchange, BinExchange over two Fills, panel values.
- ROS launch test of the full SIM graph with `virtual_plc`: Fill → Process → one PalletExchange per colour → BinExchange over two decks → reset.

---

## Decision Log (grilling session 2026-10-04)

| # | Question | Decision |
|---|---|---|
| D1 | Who drives the belt and other moving parts | New ROS2 nodes; ROS2 owns the flow (`cell_orchestrator`). Supersedes ADR 0005 §2/§4. |
| D2 | Protocol to devices | Belts and devices have no ROS2 drivers; ROS2 speaks the protocol of a programmable cell controller: Modbus TCP (`pymodbus`). OPC UA later possible behind the same port. EtherCAT and UR I/O rejected. |
| D3 | Name for the whole module | No glossary term ("fabric module" was informal; "Fabric" clashes with DataFabric). |
| D4 | Feeder | Flexible-feeder module placing Gearwheels onto the belt (RNA FlexType P class) = **FlexFeeder**; FeedHopper retired. Belt kept. |
| D5 | Classification | Colour + intact mocked, generated at Fill in the SIM FlexFeeder behind a `GearClassifier` seam. Vision out of scope. |
| D6 | Towers | Replaced by **Pallet** (single-rod, 10 Gearwheels) at a **PalletStation** on a **PalletLane**; SpindleTower and RearStand retired. Gearwheels leave for packing or assembly. |
| D7 | Pallets per lane | One Pallet, out −X and back empty. Swap buffer = future upgrade. |
| D8 | Pallet away | Part of the 10th Gearwheel's **SortCycle**: arm HOME ‖ PalletExchange; next cycle starts after both. No reordering. |
| D9 | Bin count bug | Defective = **Rejected** at belt stop, **Scrapped** when the exit eye counts it on the next run. Only Scrapped counts. |
| D10 | Bin exchange | At belt stop, Scrapped ≥ 20 → **BinExchange** (+X, tip, return) while the arm sorts the new Batch. Exact count is unimportant (recycling). Belt never moves while the bin is away. |
| D11 | Pallet ‖ bin | Independent; may overlap; no interlock. |
| D12 | Reset | Connect / reload / RESET_FAULT = full system reset as a **physical flush** in SIM and LIVE; ConveyorStatus `RESETTING`, all buttons disabled, ends `EMPTY`. Triggered by `CLEAR_WORKSPACE` on connect. |
| D13 | Unit 8 issues | Not fixed on `feat/conveyor-flow`; addressed in Unit 9, ported back later if needed. |
| D14 | Data flow | One-directional: intents down, state up; device nodes never call each other. |
| D15 | Branch | `feat/conveyor-devices` from `feat/conveyor-flow`. |
| D16 | Motor management | Drive runs the motor (ramps, limits, STO); controller commands the drive and owns fast reactions; ROS only writes intents and reads status. |
| D17 | Lane drive | 24 V MDR (Interroll RollerDrive EC5000 + MultiControl class). |
| D18 | Belt speed | Single preset; ramps in the drive. |
| D19 | Poll rate | 5 Hz controller poll; latched counters with sequence numbers; UI extrapolates belt motion. |
| D20 | Device fault | ConveyorStatus `FAULT`, everything frozen, ERROR frame names the device; RESET_FAULT → flush reset. |
| D21 | EmergencyStop scope | Also freezes belt, FlexFeeder, lanes and bin slide; LIVE has the hardwired chain independently. |
| D22 | Stop | ~~Belt + FlexFeeder freeze~~ superseded by D30. In-flight SortCycle (incl. PalletExchange) and BinExchange complete; Process resumes. |
| D23 | Dispatch order | Belt order (lead first), the same as today's feed order. |
| D24 | Batch size | Comes from the FlexFeeder: continuous placement while the belt runs (≥ 0.13 m spacing, variable cycle time); belt + feeder stop at the eye; Batch = Gearwheels inside the PickZone; upstream ones wait. BeltCapacity = physical limit only. |
| D25 | Counts display | Counters overlay at the scene's top-right corner (DOM, not a 3D panel; the post-mounted panel was dropped 2026-10-07): FlexFeeder remaining, ScrapBin count, Pallet counts n/10. Bin mesh keeps green/red. |
| D26 | SIM deck | Generated by `virtual_plc` at Fill, seedable; classification reported per placement. |
| D27 | ADR | ADR 0006. |
| D28 | Staging | 9.0–9.5 as above; finer split later; no beans yet. |
| D29 | Defaults | `CELL_FILL` / `CELL_PROCESS` / `CELL_STOP`; `PALLET_CAPACITY` 10; `BIN_EXCHANGE_THRESHOLD` 20; PalletExchange ≈ 6 s, BinExchange ≈ 8 s; end of deck = final flush. |

### Review follow-up (2026-10-06, code review of `194b7ad..507f20b`)

| # | Question | Decision |
|---|---|---|
| D30 | What Stop finishes | Stop keeps the cell's state, but every operation already running is driven to its end. The FlexFeeder stops placing at once. A RUN_TO_PICKZONE belt run continues to the eye, and the Batch there is registered but not sorted. A final FLUSH runs out (→ EMPTY). The in-flight SortCycle (incl. PalletExchange) and BinExchange complete. Process resumes: it sorts a registered Batch first, waits for the bin HOME, and picks RUN_TO_PICKZONE or FLUSH by the same rule as after a sorted Batch. |
| D31 | EmergencyStop | Everything stops where it is, immediately: FREEZE on the controller (belt, FlexFeeder, lanes, bin) and the arm's PickAndPlace goal is cancelled, which brings the arm to a safe stop in place. The cell goes FAULT. The Gateway closes the WebSocket session after forwarding EMERGENCY_STOP; the operator reconnects, and the CLEAR_WORKSPACE sent on connect runs the flush reset. RESET_FAULT stays the recovery for a device fault. |
| D32 | Gearwheel held when the flush starts | It is finished onto its colour's Pallet (counts as a drop), then the arm goes HOME. |
| D33 | Races | The orchestrator is a single serialized state machine: every device result, operator intent and reset step is an event applied under one owner, so a late result can never be dropped or applied to the wrong run. A device fault is never lost: it always ends in FAULT and a DEVICE_FAULT frame, whatever run it belongs to. Counts the flush depends on come from device results, not from asynchronous snapshots. |
| D34 | Panel counts | The counters overlay shows exactly what `cell_state.stations` says (ScrapBin = Scrapped only); no client-side recount. |

### Improvement round (2026-10-07)

| # | Question | Decision |
|---|---|---|
| D35 | Which Gearwheel stops the belt at the PickZone eye | Only an intact one that is still on the belt. The controller knows each item's class from its placement record (encoder tracking, as a real PLC does), so defectives ride past the eye and fall into the ScrapBin on the run that carries them off the end, the first run included. A Gearwheel the arm has taken off the belt is gone from the belt: in SIM `virtual_plc` removes it when the arm grasps it (a SIM-only physics seam; the register map is unchanged, LIVE needs nothing). Defectives are registered Rejected as soon as belt tracking reports their placement, so the exit eye always has a Rejected one to turn Scrapped. Every run therefore carries the next intact Gearwheel the full way to the eye. |
| D36 | EmergencyStop button | TeleopClient shows an EMERGENCY STOP button whenever a session is connected, enabled in every ConveyorStatus and RobotState (FAULT and RESETTING included). It sends the existing EMERGENCY_STOP (D31); nothing else changes. Supersedes the Unit 6.6.4a removal. |
| D37 | Arm path to a Pallet | Partly superseded by D38: the pin-tip release goes with the pins; the rule that the arm crosses above every obstacle at a travel height stays. The carried Gearwheel and the tool never pass beside a SpindleTower pin. After the lift the arm rises to a travel height above every pin top plus a Gearwheel and clearance, crosses at that height to above its colour's pin, lowers straight down until the Gearwheel is threaded on the pin tip, releases it there (it slides down the pin to its slot; a tool centred on the Gearwheel can't follow it down a 0.20 m pin, and at low slots the wrist would strike the neighbouring pin), and rises back to the travel height before HOME. Same 10 phases; only the via heights change. A regression test samples every segment, HOME to HOME, against all three pins (wrist links, tool, carried Gearwheel). |
| D38 | Pallet form (2026-10-07) | The single-rod Pallet is replaced by a **nest tray Pallet**: a flat kitting tray with 2 × 5 round pockets, one Gearwheel per pocket, the tray's long axis along the PalletLane (X). Why: a 0.20 m rod per colour is an obstacle the arm must clear at every transfer (D37), it forces a release on the rod tip, and a real cell sorting finished gears for packing or assembly puts them in nest trays (no face contact, fixed positions a downstream robot can pick from), not on rods. The drop target becomes a pocket: WorkcellNode's drop slot returns pocket k's (x, y) and a constant z (tray top), filled row by row from the pocket nearest the arm; `STACK_STEP_M` stops being a height. Travel height drops to tray wall + Gearwheel + clearance (~0.10 m), which also widens reach. Layout must be validated against the planner: a first check with lanes at y = -0.32 / -0.10 / +0.12, pocket pitch 0.09 m, pockets x = -0.24 .. -0.60 left one corner pocket out of reach at the old 0.25 m travel height, so the layout is fixed in the bean with the new travel height and a reach test over every pocket × the real pick band. Bean hand-sim-4jbb. **Final (2026-10-07):** stations x −0.415, y −0.29 / −0.04 / +0.21; pocket pitch 0.105 m; tray 0.03 m high, pockets 0.01 m deep (a Gearwheel rests half-sunk on the pocket floor at z 0.02). The planner drops `RELEASE_HEIGHT_M` and `SPINDLE_PIN_HEIGHT_M`: approach/lift 0.08 m, travel 0.08 m (seated-gear top 0.04 + 0.04), and the drop lowers straight to the pocket floor. The heights are this low on purpose: joint-space interpolation from travel height to the pocket drifts the TCP off the vertical roughly in proportion to the drop height, and inside the bore it must stay under 5.5 mm (bore r 0.0515 vs Gearwheel r 0.046). Measured max: 2.9 mm. A full-depth pocket (drop to z 0.01) gave 6.4 mm and was rejected. `test_transfer_never_strikes_a_tray` replaces the pin-strike test. Unit 10 (`units.md`) records the follow-up idea of an edge-standing slot rack. |
