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
High-priority safety command immediately aborting all active joint motion or actuation and transitioning RobotState to FAULT.
_Avoid_: Kill switch, halt packet, cancel signal

**CannedTrajectory**:
Pre-validated canonical arm waypoint sequence (`HOME`, `READY`, `INSPECT_POSE`) executed with bounded velocity and acceleration.
_Avoid_: Preset, recorded path, macro

**KinematicLinkAttachment**:
Deterministic grasping mechanism in simulation parenting an object mesh to the DexterousPalm on `tool0` upon proximity threshold ($15\text{mm}$) and grasp command.
_Avoid_: Physics grip, collision grab, magnetic lock

**Conveyor**:
Linear belt in front of the manipulator carrying Gearwheels from the FeedHopper toward the ScrapBin; it runs until the lead Gearwheel of the current Batch reaches the far edge of the PickZone, then stops while the Batch is sorted.
_Avoid_: Indexing conveyor, step feeder, conveyor line, moving belt

**FeedHopper**:
Reservoir at the upstream end of the Conveyor, filled on demand with a fixed deck of 100 Gearwheels whose color and soundness are already known.
_Avoid_: Container, holder, magazine, feeder

**Batch**:
The Gearwheels dropped onto the Conveyor during one belt run, between 3 and BeltCapacity (fewer only when the FeedHopper runs out).
_Avoid_: Wave, load, lot

**PickZone**:
The stretch of the Conveyor within the manipulator's reach where a stopped Batch is sorted.
_Avoid_: Active area, operational area, pickup station

**BeltCapacity**:
Maximum number of Gearwheels one Batch may hold, set by the size of the PickZone.
_Avoid_: Belt limit, N_max

**ConveyorStatus**:
Operational state of the Conveyor and FeedHopper (`EMPTY`, `LOADED`, `FEEDING`, `HALTED`, `STOPPED`), independent of RobotState.
_Avoid_: Belt mode, feed state, RobotState

**Stop**:
Operator pause of feeding: the Conveyor freezes and no further Gearwheels are dispatched, while the pick already under way completes; processing resumes from where it paused.
_Avoid_: Pause, halt, EmergencyStop

**RearStand**:
Fixture behind the manipulator carrying the three SpindleTowers.
_Avoid_: Tower rack, shelf, back table

**SpindleTower**:
Physical sorting destination vertical post receiving inspected sound gearwheels by color (`WHITE`, `GREEN`, `BLUE`); it empties itself once it holds 10.
_Avoid_: Peg, stacker, pole

**ScrapBin**:
Physical disposal destination at the Conveyor exit receiving unsound gearwheels of any color by dropping off the belt end; shown only as empty or not empty, and emptied once it holds 100.
_Avoid_: Trash, reject pile, discard box, recycle bin

**Gearwheel**:
Cylindrical manufactured workpiece with perimeter teeth, carrying a color (`WHITE`, `GREEN`, `BLUE`) and soundness (sound or defective), targeted for feeding, pickup, and sorting.
_Avoid_: Item, puck, token, part, gear

**ClearWorkspace**:
Explicit administrative command resetting all registered Gearwheels, SpindleTowers and the ScrapBin; also issued on every TeleopClient connect and after FAULT.
_Avoid_: Reset scene, wipe table, delete objects

**WorkcellState**:
Authoritative domain state component tracking registered Gearwheels, their coordinates, color and soundness, and SpindleTower and ScrapBin inventory. A Gearwheel enters it only when registered at a stopped Conveyor; FeedHopper and belt contents belong to TeleopClient alone.
_Avoid_: Scene graph, world model, spawn manager, entity repo

**AnalyticalInverseKinematics**:
Closed-form geometric solver computing exact 6-DoF joint configurations for Cartesian waypoints with minimal angular displacement.
_Avoid_: Numerical IK, Jacobian solver, trajectory optimizer

**PickAndPlaceSequence**:
Deterministic multi-phase waypoint trajectory executing workpiece approach, pick, grasp, lift, drop, release, and return to home.
_Avoid_: Motion script, pick routine, macro

**WorkcellNode**:
Authoritative standalone ROS2 node managing SpindleTower inventory, workpiece presence, and workspace lifecycle services.
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

