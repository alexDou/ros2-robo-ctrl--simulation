### Conveyor Devices (Unit 9) — Real-Device FlexFeeder, Conveyor, PalletLanes and ScrapBin Exchange

* **Goal**: Make every moving part of the Flow B cell drivable with real, purchasable devices through new ROS2 nodes, while SIM keeps working as well as Unit 8 does. Branch `feat/conveyor-devices`, cut from `feat/conveyor-flow`.
  - The FlexFeeder places Gearwheels onto the Conveyor.
  - The Conveyor stops when the lead Gearwheel reaches the PickZone eye.
  - The arm sorts the Batch in SortCycles: intact Gearwheels go to their colour's Pallet; defectives are Rejected and become Scrapped when they fall off the belt end.
  - A full Pallet (10) leaves −X on its PalletLane and comes back empty.
  - The ScrapBin leaves +X once it holds ≥ 20 Scrapped at a belt stop, dumps, and returns.
  - A display panel beside the cell shows the FlexFeeder remaining count, the ScrapBin count and the three Pallet counts.
* **Architecture**: ROS2 owns the flow (ADR 0006).
  - A `cell_orchestrator` commands the device nodes; the device nodes talk Modbus TCP to a programmable cell controller.
  - In SIM, a `virtual_plc` serves the same register map.
  - TeleopClient becomes operator panel + visualizer.
  - Staging is contract-first: 9.0 contracts → 9.1–9.4 in parallel against mocked seams → 9.5 integration.
  - Detailed layout, register map, state machines and decision log: [implementation_wireframe.md](implementation_wireframe.md).

---

## Problem Statement

The operator watches a convincing Flow B cell, but only the UR5e behind it is real-ready. The FeedHopper, Conveyor, Batches and Gearwheel classification are simulated in the browser, and SpindleTowers and the ScrapBin "empty themselves" by a counter reset. Nothing in the backend could drive a real belt, a real feeder or a real outbound carrier. A browser reload today does not even reset the backend: only the browser's own stores are cleared. Defectives are counted into the ScrapBin while they still lie visibly on the belt. As a result the system cannot move toward a real cell without rewriting its core flow.

## Solution

Every moving part becomes a ROS2-managed device, modelled on hardware a cell integrator would actually buy:
- **FlexFeeder**: an RNA FlexType P class flexible-feeder module.
- **Conveyor**: a cobot-cell belt on a VFD/BLDC drive, with an encoder and two photo-eyes.
- **PalletLanes**: three 24 V motor-driven roller lanes (Interroll RollerDrive EC5000 + MultiControl class) carrying single-rod Pallets.
- **ScrapBin exchange**: a pneumatic rodless slide with a tipper (Festo DGC-K + DSM / SMC MY1 + CRB class).
- **Cell controller**: a programmable unit with a Modbus TCP server (WAGO PFC200 class) that owns the time-critical reactions.

ROS2 nodes express intents and observe state. In SIM a virtual controller behaves identically, so the same ROS2 graph drives SIM and LIVE. The operator keeps the familiar Fill / Process / Stop controls and sees Pallets and the bin physically leave and return. A display panel shows the counts. Connecting, reloading or recovering from FAULT always runs one visible physical flush reset.

## User Stories

1. As an operator, I want to press Fill and have the FlexFeeder loaded with a 100-Gearwheel deck, so that a run can start.
2. As an operator, I want Fill enabled only when the FlexFeeder is empty and nothing is running, so that I cannot overfill or disturb a run.
3. As an operator, I want Process to start the Conveyor and the FlexFeeder, so that Gearwheels flow toward the arm.
4. As an operator, I want Process disabled until the FlexFeeder is filled, so that I cannot start an empty run.
5. As an operator, I want the Conveyor to stop by itself when the lead Gearwheel reaches the PickZone eye, so that the Batch is in reach.
6. As an operator, I want each Batch to hold a naturally varying number of Gearwheels, so that the cell behaves like a real feeder rather than a scripted count.
7. As an operator, I want Gearwheels placed upstream of the PickZone at belt stop to wait for the next Batch, so that nothing out of reach is dispatched.
8. As an operator, I want the arm to sort the Batch one Gearwheel at a time in belt order, so that I can follow each SortCycle.
9. As an operator, I want intact Gearwheels placed on the Pallet of their colour, so that sorting is visible and correct.
10. As an operator, I want defective Gearwheels left on the belt as Rejected, with no arm motion, so that the arm only handles good parts.
11. As an operator, I want Rejected Gearwheels to fall into the ScrapBin on the next belt run, so that disposal is physical and visible.
12. As an operator, I want the ScrapBin count to rise only when a Gearwheel actually falls in, so that the count matches what I see.
13. As an operator, I want a Pallet to leave −X when it holds 10 Gearwheels and return empty, so that full carriers go on to packing or assembly.
14. As an operator, I want the arm to go HOME while a Pallet travels, and the next SortCycle to start only when both are done, so that the cycle is clear and safe.
15. As an operator, I want the ScrapBin to leave +X when it holds 20 or more at a belt stop, dump and return, so that scrap is recycled without stopping sorting.
16. As an operator, I want the arm to keep sorting while the ScrapBin is away, so that the BinExchange costs no throughput.
17. As an operator, I want the Conveyor never to move while the ScrapBin is away, so that no Gearwheel falls on the floor.
18. As an operator, I want a PalletExchange and a BinExchange to be able to happen at the same time, so that independent devices don't wait on each other.
19. As an operator, I want the arm to return HOME after a Batch is sorted before the Conveyor restarts, so that the belt runs clear of the arm.
20. As an operator, I want a final flush run when the FlexFeeder is empty, so that leftover Rejected Gearwheels end up in the ScrapBin.
21. As an operator, I want Fill re-enabled and Process disabled after the final flush, so that I know the run is over.
22. As an operator, I want Stop to drive every running operation to its end (the FlexFeeder stops placing, the belt runs on to the eye, the current SortCycle and any running exchange complete), so that nothing is stranded halfway (D30).
23. As an operator, I want Process to resume after Stop from where it paused, so that I don't lose the run.
24. As an operator, I want EmergencyStop to freeze the arm, the Conveyor, the FlexFeeder, the PalletLanes and the ScrapBin slide where they are, and to end my session, so that the whole cell stops at once and recovery is always a fresh connect with a flush reset (D31).
25. As an operator, I want a device fault (drive fault, end-sensor timeout) to freeze the cell and name the device in an error, so that I know what failed.
26. As an operator, I want ConveyorStatus to show FAULT on a device fault, so that the state is unambiguous.
27. As an operator, I want RESET_FAULT to run the physical flush reset, so that recovery always ends in a known clean state.
28. As an operator, I want connecting or reloading the browser to run the same flush reset, so that the cell always starts clean.
29. As an operator, I want ConveyorStatus RESETTING with every button disabled during a reset, so that I cannot interfere.
30. As an operator, I want the reset to finish in EMPTY with Fill enabled, so that I can start again immediately.
31. As an operator, I want a display panel at the right side of the cell showing the FlexFeeder remaining count, so that I can see how much is left.
32. As an operator, I want the display panel to show the ScrapBin count, so that I can anticipate a BinExchange.
33. As an operator, I want the display panel to show each Pallet's count out of 10, so that I can anticipate a PalletExchange.
34. As an operator, I want the ScrapBin mesh to keep its green/red empty/non-empty colour, so that its state is readable at a glance.
35. As an operator, I want to see Pallets slide off-scene to −X and come back, so that I can see the exchange happen.
36. As an operator, I want to see the ScrapBin slide off-scene to +X, tip and come back, so that I can see the dump happen.
37. As an operator, I want belt motion to look smooth between 5 Hz updates, so that the scene stays readable.
38. As an operator, I want the counts drained to 0 on the display during a reset, so that I can see the reset progress.
39. As an integrator, I want every device reached through one Modbus TCP register map, so that commissioning a real cell means implementing one documented contract.
40. As an integrator, I want belt stop, exit counting and interlocks to run in the cell controller, so that safety-relevant timing never depends on ROS polling.
41. As an integrator, I want latched counters with sequence numbers, so that a 5 Hz poll never misses a Gearwheel event.
42. As an integrator, I want Gearwheel positions from FlexFeeder placement reports plus belt encoder travel, so that no camera is needed.
43. As an integrator, I want the FlexFeeder treated as a black-box module with a small contract, so that any comparable flexible feeder can be used.
44. As an integrator, I want SIM and LIVE to differ only by the controller address and the virtual controller being on or off, so that there is no mock debt.
45. As an integrator, I want hardware safety (safety relay, STO, pneumatics dump) documented as separate from software EmergencyStop, so that nobody relies on software for safety.
46. As an integrator, I want drive ramps and belt speed as commissioning parameters, so that Gearwheels don't slide on the belt.
47. As an integrator, I want PalletExchange and BinExchange durations as commissioning parameters, so that SIM timing can match the real hardware.
48. As a developer, I want device nodes tested against an in-process Modbus server, so that tests are hermetic and fast.
49. As a developer, I want the orchestrator tested with faked device and arm actions, so that flow logic is verified without hardware.
50. As a developer, I want a seedable SIM deck, so that tests and E2E runs are deterministic.
51. As a developer, I want colour and intactness behind a classifier seam, so that a real scanner can replace the mock later.
52. As a developer, I want a ROS launch test of the full SIM graph, so that the real ROS wiring is proven end to end.
53. As a developer, I want the web E2E suite to keep mocking everything beyond TeleopClient, so that it stays fast and its scope stays clear.
54. As a developer, I want the browser to send only intents (Fill, Process, Stop, ClearWorkspace on connect, EmergencyStop, ResetFault), so that the browser can't drive devices directly.
55. As a reviewer, I want the superseded parts of ADR 0005 named explicitly, so that the history of both branches stays clear.

## Implementation Decisions

- **Ownership (ADR 0006).**
  - `cell_orchestrator` owns ConveyorStatus (`EMPTY`, `LOADED`, `FEEDING`, `HALTED`, `STOPPED`, `FAULT`, `RESETTING`), Batches and SortCycles.
  - Belt tracking (conveyor device node) owns where every Gearwheel lying on the belt is. WorkcellState owns what each registered Gearwheel is and where it goes.
  - Data flows one way: intents down, state up. Device nodes never call each other.
- **New ROS2 Python package with five nodes**:
  - Conveyor device node: run-to-PickZone / flush / stop intents, belt tracking, exit-eye events.
  - FlexFeeder device node: fill, enable/disable, quick-empty, remaining count, placement events with mocked classification.
  - Station device node, run four times: three PalletLanes and the ScrapBin exchange, all sharing one exchange state machine `HOME → LEAVING → AWAY → RETURNING → HOME`, plus `FAULT`.
  - `cell_orchestrator`.
  - `virtual_plc` (SIM only).

  Device nodes depend on a `FieldIoPort` with one Modbus TCP adapter.
- **New ROS2 interfaces**:
  - Actions: run Conveyor (mode `TO_PICKZONE` / `FLUSH` → stop reason), station exchange (feedback = exchange state).
  - Services: FlexFeeder fill / enable / quick-empty; station reset (WHITE / GREEN / BLUE / SCRAP) on WorkcellNode; orchestrator Fill / Process / Stop / Reset.
  - Exact names are locked in 9.0.
- **Cell controller register map** (provisional table in the wireframe, locked in 9.0):
  - Command words carry a sequence number. Status words echo the acknowledged sequence.
  - Exit-eye and placement counters are latched.
  - Placement records go in a ring buffer: sequence, lateral position, encoder count at placement, colour, intact.
  - Faults are reported as codes.
- **Controller-local logic** (also implemented by `virtual_plc`):
  - stop the belt at the PickZone eye;
  - count exit-eye events;
  - forbid belt motion while the ScrapBin is not HOME;
  - forbid FlexFeeder placement closer than 0.13 m of belt travel to the previous placement;
  - Pallet stop gate;
  - drive ramps.
- **Batch formation**:
  1. On a feed run the FlexFeeder places continuously. A variable cycle time is the source of randomness; BeltCapacity is only a physical limit.
  2. The belt and the FlexFeeder stop when the lead Gearwheel trips the PickZone eye.
  3. The Batch is the Gearwheels inside the PickZone at that stop. Any upstream ones join the next Batch.
- **Registration at belt stop**: the orchestrator registers each Batch Gearwheel with WorkcellNode, using the positions from belt tracking. Intact ones become pickable. Defective ones become **Rejected**: registered, not for processing, still on the belt.
- **SortCycle**: one Gearwheel from dispatch to completion, in belt order (lead first).
  1. PickAndPlace to the Pallet of its colour.
  2. Commit the drop.
  3. If the Pallet reached `PALLET_CAPACITY` (10), it is FULL: the arm goes HOME and the PalletExchange runs at the same time. When both finish, the station is reset to 0.
  4. The next SortCycle starts only after the previous one completes.
- **Scrapped**: a Rejected Gearwheel becomes Scrapped when the exit eye counts it during the next belt run. Only Scrapped Gearwheels count as ScrapBin contents.
- **BinExchange**: at a belt stop, if Scrapped ≥ `BIN_EXCHANGE_THRESHOLD` (20), the BinExchange starts and runs while the arm sorts the new Batch. The next belt run waits until the bin is HOME. The bin is physically sized for threshold + BeltCapacity. PalletExchange and BinExchange are independent and may overlap.
- **Batch end**: arm HOME → (wait for bin HOME) → next feed run. When the FlexFeeder is empty and the last Batch is sorted, a final flush run follows → `EMPTY`, Fill on, Process off.
- **Stop**: the FlexFeeder stops placing; the belt run continues to the eye (its Batch is registered, not sorted) or a final flush runs out. The in-flight SortCycle (including its PalletExchange) and any BinExchange complete. Process resumes (D30).
- **EmergencyStop** (software): RobotState → FAULT as today, the PickAndPlace goal is cancelled (arm safe-stops in place), plus a freeze of all devices. ConveyorStatus → FAULT. The Gateway then closes the session; reconnecting runs the flush reset (D31).
- **Device fault**: freeze all, ERROR frame naming the device and fault code, ConveyorStatus → FAULT.
- **Reset**: `CLEAR_WORKSPACE`, sent by TeleopClient on every connect (and therefore on every reload), and `RESET_FAULT` both trigger the flush reset. ConveyorStatus is `RESETTING` throughout:
  1. Abort the SortCycle; the arm goes HOME.
  2. FlexFeeder quick-empty.
  3. Belt flush: everything on the belt goes into the bin, intact Gearwheels included.
  4. Every non-empty Pallet makes a PalletExchange.
  5. BinExchange if the bin is non-empty.
  6. WorkcellState is cleared.
  7. ConveyorStatus → `EMPTY`.
- **Wire (schemas + codegen)**:
  - New command types `CELL_FILL`, `CELL_PROCESS`, `CELL_STOP`.
  - `CLEAR_WORKSPACE` keeps its name and now means the flush reset.
  - New telemetry object `cell_state`: ConveyorStatus, FlexFeeder remaining, belt offset, the Gearwheels lying on the belt with position + colour + intact, and each station's exchange state + count.
  - WorkcellState distinguishes Rejected and Scrapped.
  - Constants: `TOWER_CAPACITY` → `PALLET_CAPACITY` (10), `MAX_SCRAP_BIN_CAPACITY` (100) → `BIN_EXCHANGE_THRESHOLD` (20). Tower coordinates become PalletStation coordinates.
  - On this branch the browser no longer sends `SPAWN_OBJECT` or `PICK_AND_PLACE_TARGET`; they stay in the schema.
- **EdgeNode**: maps `CELL_*`, `CLEAR_WORKSPACE` and `RESET_FAULT` onto orchestrator services, extends EmergencyStop to the device freeze, and forwards `/cell/state` into telemetry, the same way it forwards `/workcell/state` today.
- **Gateway**: validates and passes through the new commands and `cell_state`. The ingress limiter is unchanged. The TelemetryThrottler's sample-hold must always carry the latest `cell_state`.
- **Rates**: the controller status poll is 5 Hz. `/cell/state` is published on every event, plus belt offset at 5 Hz while the belt moves. TeleopClient extrapolates belt motion from the reported state and speed. No new rate touches the arm path.
- **TeleopClient**:
  - Delete the deck, sequencer and belt physics.
  - Fill / Process / Stop send intents, gated by ConveyorStatus; all buttons are disabled in `RESETTING` and `FAULT`.
  - Send `CLEAR_WORKSPACE` on every connect.
  - The scene renders from `cell_state` + WorkcellState: FlexFeeder module at the upstream end, belt Gearwheels, PalletLanes with Pallets sliding −X off-scene and back, ScrapBin slide +X with tip, and a display panel at +X beside the belt facing the default camera.
  - Exchange motion is animated between reported states using the nominal durations.
- **SIM commissioning defaults**: single belt speed with drive-side ramps; PalletExchange round trip ≈ 6 s; BinExchange ≈ 8 s; FlexFeeder cycle-time range tuned so a Batch usually holds about 3–10. `virtual_plc` generates the deck at Fill (10 defective in random colours + 30 WHITE / 30 GREEN / 30 BLUE, shuffled, optional seed).

## Testing Decisions

- **Good tests** assert externally observable behaviour at a seam: registers and topics in, actions, services and `cell_state` out. They never assert on internal helper calls.
- **Seams** (highest possible; one new):
  - **New: the cell controller register map.** Device nodes and the orchestrator run against `virtual_plc` or an in-process Modbus server.
  - **Existing: EdgeNode** RobotCommand in / RobotTelemetryEvent out. Prior art: the `test_edge_bridge_*` suites.
  - **Existing: WorkcellNode services.** Prior art: `test_workcell_*`, including the bin-cap and routing suites, which must be updated.
  - **Existing: the PickAndPlace action**, faked as in the arm controller execution tests.
  - **Existing: Gateway domain contract tests** (`cargo nextest`; every new test file needs its own `[[test]]` entry).
  - **Existing: TeleopClient ↔ mock gateway** (vitest + Cucumber E2E). This proves web code only and never confirms Gateway or ROS behaviour.
- **9.0 contract tests** (Python / Rust / TS): the new command types; `cell_state` shape; Rejected / Scrapped; renamed constants; invalid values rejected.
- **9.1 device tests**:
  - The belt stops at the eye through controller logic, not a ROS poll.
  - Placement spacing ≥ 0.13 m.
  - Encoder tracking puts Gearwheels where `virtual_plc` has them.
  - Exit-eye counts are never lost across slow polls.
  - Station exchange sequence and timeouts → FAULT.
  - Belt refuses to run while the bin is away.
  - Seeded deck composition.
- **9.2 orchestrator + WorkcellNode tests**:
  - Registration at belt stop (intact vs Rejected).
  - SortCycle in belt order.
  - 10th drop → FULL → HOME + PalletExchange → reset to 0 → next cycle.
  - Rejected → Scrapped on the exit eye.
  - Scrapped ≥ 20 at belt stop → BinExchange overlapping sorting; belt waits for bin HOME.
  - PalletExchange and BinExchange overlap.
  - Stop / resume.
  - EmergencyStop and device fault freeze everything.
  - Flush reset from `CLEAR_WORKSPACE` and from `RESET_FAULT` ends in `EMPTY`.
  - Final flush at end of deck.
- **9.3 Gateway tests**: new commands validated and forwarded; `cell_state` passes through the throttler unchanged and latest-wins.
- **9.4 vitest**:
  - Button gating per ConveyorStatus.
  - `CLEAR_WORKSPACE` sent on connect.
  - The scene follows `cell_state`: Pallet −X and bin +X animations, display panel values.
  - The bin mesh colour.
  - The deleted modules are gone.
- **9.5 integration**:
  - Seeded mock-gateway Cucumber suite: full run, Stop / resume, EmergencyStop → reset, reload → reset, PalletExchange, BinExchange over two Fills.
  - A ROS launch test of the full SIM graph with `virtual_plc`.

## Out of Scope

- Vision of any kind, including real colour or defect detection. Classification stays mocked behind the `GearClassifier` seam.
- Real hardware commissioning: register map implementation on a physical controller, FlexFeeder integrator programming, safety circuit design.
- A swap-buffer second Pallet per lane; AMR collection; OPC UA / PLC adapter.
- Conveyor tracking (picking from a moving belt). The cell stays stop-and-pick.
- Any change to `feat/conveyor-flow` or `main`. Issues found here (missing backend reset on connect, early scrap counting) are fixed in Unit 9 and ported back later only if needed.
- Bean creation for Unit 9. A finer split comes later.

## Further Notes

- Glossary changes are in `CONTEXT.md`. The architecture decision is [ADR 0006](../../../docs/adr/0006-ros2-owned-conveyor-devices-and-field-io.md).
- Prerequisite for 9.1: `python3-pymodbus` installed from apt (the user installs it).
- Open point for 9.2: what happens to a Gearwheel held by the DexterousPalm when a reset aborts its SortCycle (proposal: released over the ScrapBin before HOME).
- Any rate stated here follows `.agents/rules/pipeline-rates.md`.
