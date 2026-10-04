# 0006. ROS2-Owned Conveyor Devices over a Modbus TCP Cell Controller

## Status
Accepted (2026-10-04). Applies to branch `feat/conveyor-devices` (cut from `feat/conveyor-flow`). Supersedes parts of [ADR 0005](0005-conveyor-branch-client-owned-feed-and-classification.md) on that branch only; ADR 0005 stays valid for `feat/conveyor-flow`.

## Context
On `feat/conveyor-flow` only the UR5e is a real ROS2-driven machine. The FeedHopper, Conveyor, Batches, Gearwheel classification and the per-gear dispatch loop are TeleopClient-local, and SpindleTower / ScrapBin "emptying" is an instant counter reset in WorkcellNode. Unit 9 makes every moving part of the cell drivable with real, purchasable devices while SIM keeps working as it does now. A real belt must stop at a sensor and a Pallet must not be dropped into while it is away, even with no browser open, so the sequencing cannot stay in the browser.

Alternatives weighed:
- **Who sequences:** TeleopClient (as now) vs a ROS2 orchestrator node.
- **Field layer:** Modbus TCP to a programmable cell controller vs PLC + OPC UA vs EtherCAT under `ros2_control` (`ethercat_driver_ros2`) vs the UR controller's own I/O (`io_and_status_controller`).
- **Where fast reactions run** (belt stop at the eye, exit counting, interlocks): ROS polling vs the cell controller's scan cycle.
- **Gearwheel positions on the belt:** a camera vs encoder tracking from feeder placement reports.
- **SIM:** instant wipes and client-side physics vs a virtual controller that serves the same register map.

## Decision
1. **ROS2 owns the flow.** A `cell_orchestrator` node owns ConveyorStatus, Batches and SortCycles and commands the device nodes (Conveyor, FlexFeeder, three PalletLanes, ScrapBin exchange). Data flows one way: intents go down (TeleopClient → Gateway → EdgeNode → orchestrator → device nodes → cell controller), and state comes up the same path. Device nodes never call each other.
2. **Field layer = Modbus TCP to a programmable cell controller** (WAGO PFC200 class). Device nodes are Python (`pymodbus`), behind one `FieldIoPort`. OPC UA to a full PLC stays a possible later adapter behind the same port. EtherCAT and UR controller I/O were rejected: too much real-time infrastructure for discrete peripherals, and too few channels with no SIM equivalent, respectively.
3. **Time-critical reactions live in the cell controller**, not in ROS: belt stop at the PickZone eye, latched exit-eye counting, belt held while the ScrapBin is away, and the Pallet stop gate. ROS polls status at 5 Hz. Latched counters with sequence numbers mean a poll never misses an event.
4. **No vision: encoder tracking.** The FlexFeeder reports each placement, and the belt encoder gives travel. Belt tracking owns where a Gearwheel on the belt is; WorkcellState owns what it is and where it goes.
5. **Classification stays mocked**, now in the SIM FlexFeeder (deck generated at Fill) behind a `GearClassifier` seam. Nothing classification-related comes from the browser.
6. **SIM twin:** a `virtual_plc` node serves the same register map and runs the same local logic, with simulated ramps and stroke times. SIM vs LIVE is a host/port launch argument, mirroring `use_fake_hardware` for the arm.
7. **One reset path:** connect, reload and `RESET_FAULT` all trigger the same physical flush reset (ConveyorStatus `RESETTING`) in SIM and LIVE. Nothing is wiped instantly.

Supersedes ADR 0005 on this branch:
- §2 (FeedHopper, belt and Batches are TeleopClient-local) → decision 1.
- §3 (UI-assigned classification) → decision 5.
- §4 (UI-driven per-gear dispatch) → decision 1. Per-gear dispatch itself stays as the SortCycle.
- §5 (reload/reconnect/FAULT resets) → decision 7. The rule stays the same; it is now a physical flush.

## Consequences
- TeleopClient becomes operator panel + visualizer. Its deck, sequencer and belt physics are deleted on this branch.
- A new seam (the cell controller register map) is the only boundary device logic is tested across. LIVE needs a commissioned controller exposing that map, and the FlexFeeder module integrator must implement its part of it (RNA does not publish such a contract).
- New ROS2 Python dependency: `python3-pymodbus` (apt).
- A reset takes seconds (it physically flushes the belt and exchanges Pallets and the bin) instead of being instant.
- Safety stays hardwired in LIVE (safety relay, STO on the belt drive, pneumatics dump). The software `EMERGENCY_STOP` freezes all devices but is not the safety function.
