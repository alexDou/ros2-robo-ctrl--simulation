# arm-UR5e controller simulation

Robotics simulation, real-time telemetry streaming, and teleoperation control platform bridging web visualizers with Gazebo and ROS2.

## Language

**RobotState**:
Operational lifecycle state of the robotic manipulator (`BOOTING`, `IDLE`, `PROCESSING`, `EXECUTING`, `FAULT`).
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


