# ROS2 Robot Controller Simulation

Robotics simulation, real-time telemetry streaming, and teleoperation control platform bridging web visualizers with Gazebo and ROS2.

## Language

**RobotState**:
Operational lifecycle state of the robotic manipulator (`BOOTING`, `STANDBY`, `IDLE`, `EXECUTING`, `FAULT`).
_Avoid_: Status, mode, condition

**ArmJointPositions**:
Array of exactly 6 floating-point values in radians representing UR5e kinematic chain angles.
_Avoid_: Joint angles, arm pose, motor coordinates

**RobotTelemetryEvent**:
Structured domain event emitted by EdgeNode containing `timestamp_ns`, `robot_state`, `joint_positions`, and `inference_metrics`.
_Avoid_: Telemetry packet, state message, status payload

**RobotCommand**:
Structured inbound instruction sent to EdgeNode containing `command_id`, `sender_id`, `timestamp_ns`, `type`, and `payload`.
_Avoid_: Action, trigger, request, signal

**Gateway**:
The Rust Actix-Web boundary service translating browser WebSocket sessions to and from the DataFabric.
_Avoid_: Web server, proxy, backend

**ActiveSession**:
Exclusive single WebSocket controller connection granted by Gateway per robot instance.
_Avoid_: Client pool, fleet connection

**DataFabric**:
The Zenoh distributed publish/subscribe protocol interconnecting Gateway and EdgeNode using RESTful keys (`robot/{id}/command`, `robot/{id}/telemetry`).
_Avoid_: Message broker, network bus, rosbridge

**EdgeNode**:
The Python and ROS2 Jazzy process executing robot control, sensor ingestion, and telemetry serialization.
_Avoid_: Worker, python script, listener

**TeleopClient**:
The browser-based Preact application managing WebSocket connections to Gateway, real-time telemetry observation, and operator controls.
_Avoid_: Web visualizer, frontend, dashboard, web client, UI

**RobotVisualizer**:
The Three.js WebGL component within TeleopClient rendering the kinematic manipulator model synchronized with live telemetry.
_Avoid_: 3D canvas, model viewer, simulation view

**DexterousPalm**:
The end-effector mounted to the UR5e kinematic flange (`tool0`) responsible for object grasping and releasing.
_Avoid_: Gripper hand, claw, tool attachment

**SingleCommandGating**:
Strict lifecycle precondition in EdgeNode rejecting any inbound motion or actuation command when RobotState is not IDLE.
_Avoid_: Command queue, command buffering, FIFO buffer

**EmergencyStop**:
High-priority safety command, sent from the always-visible EmergencyStop button, immediately freezing the arm and every cell device where they are, transitioning RobotState to FAULT and ending the session.
_Avoid_: Kill switch, halt packet, cancel signal

**CannedTrajectory**:
Pre-validated canonical arm waypoint sequence (`HOME`, `READY`, `INSPECT_POSE`) executed with bounded velocity and acceleration.
_Avoid_: Preset, recorded path, macro

**KinematicLinkAttachment**:
Deterministic grasping mechanism in simulation parenting an object mesh to the DexterousPalm on `tool0` upon proximity threshold ($15\text{mm}$) and grasp command.
_Avoid_: Physics grip, collision grab, magnetic lock

**Conveyor**:
Linear belt in front of the manipulator carrying Gearwheels from the FlexFeeder toward the ScrapBin; it runs until the lead Gearwheel reaches the far edge of the PickZone, then stops while the Batch is sorted. It never moves while the ScrapBin is away.
_Avoid_: Indexing conveyor, step feeder, conveyor line, moving belt

**FlexFeeder**:
Flexible-feeder module at the upstream end of the Conveyor that holds the Gearwheel supply and places Gearwheels one at a time onto the running belt; filled on demand with a fixed deck of 100 Gearwheels whose color and intactness are already known.
_Avoid_: FeedHopper, hopper, container, magazine

**Batch**:
The Gearwheels standing inside the PickZone when the Conveyor stops; Gearwheels placed further upstream wait for the next Batch.
_Avoid_: Wave, load, lot

**SortCycle**:
The processing of one Gearwheel from dispatch to completion, including any PalletExchange it triggers; the next SortCycle starts only when the previous one is complete.
_Avoid_: Pick cycle, iteration, PickAndPlaceSequence

**Rejected**:
A defective Gearwheel, registered as soon as the FlexFeeder places it: known not to be processed, riding the belt toward the ScrapBin. It never stops the Conveyor at the PickZone eye.
_Avoid_: Scrapped, discarded, binned

**Scrapped**:
A Rejected Gearwheel that has fallen off the belt end into the ScrapBin; only Scrapped Gearwheels count as ScrapBin contents.
_Avoid_: Rejected, deleted

**PickZone**:
The stretch of the Conveyor within the manipulator's reach where a stopped Batch is sorted.
_Avoid_: Active area, operational area, pickup station

**BeltCapacity**:
Maximum number of Gearwheels one Batch may hold, set by the size of the PickZone.
_Avoid_: Belt limit, N_max

**ConveyorStatus**:
Operational state of the Conveyor and FlexFeeder (`EMPTY`, `LOADED`, `FEEDING`, `HALTED`, `STOPPED`, `FAULT`, `RESETTING`), independent of RobotState.
_Avoid_: Belt mode, feed state, RobotState

**Stop**:
Operator pause of feeding: the Conveyor and FlexFeeder freeze and no further Gearwheels are dispatched, while the SortCycle and any exchange already under way complete; processing resumes from where it paused.
_Avoid_: Pause, halt, EmergencyStop

**Pallet**:
Outbound carrier with a 10-pocket nest tray (2 × 5 pockets) holding up to 10 intact Gearwheels of one color (`WHITE`, `GREEN`, `BLUE`), one per pocket, filled in a fixed pocket order; when full it leaves the cell for packing or assembly and returns empty (D38).
_Avoid_: SpindleTower, tower, peg, rod, stack

**PalletStation**:
The position within the manipulator's reach where a Pallet of one color stands while it receives Gearwheels.
_Avoid_: Tower slot, drop point, RearStand

**PalletLane**:
The transport that carries a Pallet from its PalletStation out of the cell and back.
_Avoid_: Tower slide, shuttle, track

**PalletExchange**:
A full Pallet leaving on its PalletLane and returning empty; the manipulator waits at home meanwhile.
_Avoid_: Tower empty, unload, swap

**ScrapBin**:
Physical disposal destination at the Conveyor exit receiving Rejected Gearwheels of any color as they drop off the belt end; shown as empty or not empty.
_Avoid_: Trash, reject pile, discard box, recycle bin

**BinExchange**:
The ScrapBin leaving the cell once it holds 20 or more Scrapped Gearwheels at a Conveyor stop, dumping them for recycling, and returning empty while sorting continues.
_Avoid_: Bin empty, recycle, dump

**Gearwheel**:
Cylindrical manufactured workpiece with perimeter teeth, carrying a color (`WHITE`, `GREEN`, `BLUE`) and intactness (intact or defective), targeted for feeding, pickup, and sorting.
_Avoid_: Item, puck, token, part, gear

**ClearWorkspace**:
Full system reset issued on every TeleopClient connect: the cell physically flushes (belt emptied into the ScrapBin, non-empty Pallets and the ScrapBin exchanged, FlexFeeder emptied) and ends empty; recovery from FAULT runs the same reset.
_Avoid_: Reset scene, wipe table, delete objects

**WorkcellState**:
Authoritative domain state component tracking registered Gearwheels (including Rejected and Scrapped), their color and intactness, and Pallet and ScrapBin inventory. An intact Gearwheel enters it when registered at a stopped Conveyor, a defective one when it is placed; where a Gearwheel lies on the belt is known from the Conveyor, not from WorkcellState.
_Avoid_: Scene graph, world model, spawn manager, entity repo

**AnalyticalInverseKinematics**:
Closed-form geometric solver computing exact 6-DoF joint configurations for Cartesian waypoints with minimal angular displacement.
_Avoid_: Numerical IK, Jacobian solver, trajectory optimizer

**PickAndPlaceSequence**:
Deterministic multi-phase waypoint trajectory executing workpiece approach, pick, grasp, lift, drop, release, and return to home.
_Avoid_: Motion script, pick routine, macro

**WorkcellNode**:
Authoritative standalone ROS2 node managing Pallet and ScrapBin inventory, workpiece presence, and workspace lifecycle services.
_Avoid_: Inventory tracker, table node, workcell manager

**ArmControllerNode**:
Standalone ROS2 Action Server node executing PickAndPlaceAction and commanding the scaled joint trajectory controller.
_Avoid_: Arm node, motion runner, trajectory worker

**TelemetryThrottler**:
Non-blocking Gateway sampler, 30 Hz nominal tick. SIM mode: 5 Hz feed (`ur_controllers.yaml`, fake hardware — what runs now) = passthrough/sample-hold. LIVE mode: 500 Hz RTDE feed (`ur_controllers_real.yaml`, physical UR5e — real-world target, deliberately kept) = decimate 500→30. Direction: lower frequencies where possible, stay real-ready. Browser: connect-gated WS (manual Connect, BOOTING window), lazy joint sub while parked, rAF render from latest sample.
_Avoid_: Downsampler, rate limiter, decimation filter

**PickAndPlaceAction**:
Typed ROS2 Action interface defining pick/drop Cartesian goal coordinates, step feedback phases, and final execution result.
_Avoid_: Pick task, move action, trajectory command

**SystemLauncher**:
Central orchestration launcher managing startup, lifecycle, and orderly shutdown of robotics or multi-tier processes.
_Avoid_: Bootstrapper, start script, runner

