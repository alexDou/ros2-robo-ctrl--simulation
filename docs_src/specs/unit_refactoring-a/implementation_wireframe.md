> [!IMPORTANT]
> Aligns with [ADR 0004](../../docs/adr/0004-real-robot-ros2-native-architecture-and-gateway-throttling.md), [unit_6_5_refactoring_architecture.md](../unit_6_5_refactoring_architecture.md), and [CONTEXT.md](../../CONTEXT.md). In this unit, we migrate from the simulation prototype backend to a production-grade, real-hardware-ready ROS2 native architecture. This includes standard ROS2 interfaces in `robot_control_interfaces`, standalone `workcell_node` and `arm_controller_node`, upstream `ros2_control` (500 Hz RTDE loop with fake hardware switch), `zenoh-bridge-ros2dds` managed by the Gateway launcher, a non-blocking 500Hz-to-30Hz `TelemetryThrottler` in Rust Gateway, and separate launch workflows for independent log observation.

Welcome to Unit Refactoring-A: Production ROS2 Native Architecture & Real-Hardware Refactoring. This specification establishes zero-mock-debt production architecture for physical UR5e operation while preserving Web visualizer contracts and Actix-Web session security boundaries.

------------------------------
## Contract-First Staged Execution Model

Development strictly follows interface boundaries. Once native ROS2 interface contracts (`robot_control_interfaces`) are locked in Stage 0, the `workcell_manager` (Stage 1), `arm_controller` (Stage 2), `robot_bringup` (Stage 3), and Gateway throttler/bridge (Stage 4) execute against mock seams. Stage 5 ties all services together in a multi-service integration test suite and retires legacy prototypes.

```
                    ┌────────────────────────────────────────────────────────┐
                    │ Refactor-A.0: ROS2 Interfaces Package (Stage 0)        │
                    │ (PickAndPlace.action, GetDropSlot.srv, ClearWorkspace) │
                    └───────────────────────────┬────────────────────────────┘
                                                │
          ┌──────────────────────┬──────────────┴────────────────┬──────────────────────┐
          │                      │                               │                      │
          ▼                      ▼                               ▼                      ▼
┌─────────────────┐   ┌─────────────────────────────┐   ┌────────────────┐   ┌───────────────────┐
│ Refactor-A.1:   │   │ Refactor-A.2:               │   │ Refactor-A.3:  │   │ Refactor-A.4: GW  │
│ workcell_manager│   │ arm_controller              │   │ robot_bringup  │   │ Throttler 500→30Hz│
│ (workcell_node) │   │ (arm_controller_node + IK)  │   │ (ROS2 Launch)  │   │ & Zenoh Bridge    │
└────────┬────────┘   └──────────────┬──────────────┘   └───────┬────────┘   └─────────┬─────────┘
          │                           │                          │                      │
          └───────────────────────────┴──────────┬───────────────┴──────────────────────┘
                                                 │
                                                 ▼
                    ┌────────────────────────────────────────────────────────┐
                    │ Refactor-A.5: Multi-Service Integration Verification   │
                    │ (robot_bringup + launch_gateway.sh + launch_teleop-client.sh)    │
                    └────────────────────────────────────────────────────────┘
```

---

## Step 1: ROS2 Interfaces Package (Refactor-A.0)

Define the authoritative wire contracts for actions and services in a standard `ament_cmake` package under `src/ros2/robot_control_interfaces/`.

1. **Package Scaffolding**:
   - Location: `src/ros2/robot_control_interfaces/`
   - Files: `package.xml`, `CMakeLists.txt`
   - Dependencies: `rosidl_default_generators`, `action_msgs`, `geometry_msgs`, `std_msgs`, `builtin_interfaces`.

2. **Action Definition**: `src/ros2/robot_control_interfaces/action/PickAndPlace.action`:
   ```action
   # Goal
   geometry_msgs/Point pick_coords
   geometry_msgs/Point drop_coords
   bool use_custom_drop
   string command_id
   ---
   # Result
   bool success
   string message
   ---
   # Feedback
   string phase
   float32 percent_complete
   ```

3. **Service Definitions**:
   - `src/ros2/robot_control_interfaces/srv/GetDropSlot.srv`:
     ```srv
     # Request
     ---
     # Response
     geometry_msgs/Point drop_coords
     int32 slot_index
     bool overflow_occurred
     ```
   - `src/ros2/robot_control_interfaces/srv/ClearWorkspace.srv`:
     ```srv
     # Request
     ---
     # Response
     bool success
     string message
     ```

4. **TDD Build Verification**:
   - Run: `colcon build --packages-select robot_control_interfaces`
   - Assert: `ros2 interface show robot_control_interfaces/action/PickAndPlace` displays correct fields.
   - Assert: Python can import `from robot_control_interfaces.action import PickAndPlace`.

---

## Step 2: Standalone Workcell Node (Refactor-A.1)

Migrate inventory tracking and workpiece coordinates from `src/edge_node/workcell.py` into a standalone, pure ROS2 node `workcell_node`.

1. **Package Scaffolding**:
   - Location: `src/ros2/workcell_manager/` (`ament_python` package)
   - Executable: `workcell_node` (`workcell_manager.workcell_node:main`)

2. **Node Implementation**:
   - Class: `WorkcellNode(Node)`
   - State Tracking:
     - Maintains SpindleTower inventory count $k$ and slot height $z_k = (k \pmod{10}) \times 0.02\text{m}$.
     - Maintains active workpiece presence and coordinates.
   - Service Servers:
     - `/workcell/get_drop_slot` (`GetDropSlot.srv`): Computes $(x_{\text{tower}} = 0.40, y_{\text{tower}} = -0.30, z_k)$.
     - `/workcell/clear_workspace` (`ClearWorkspace.srv`): Resets inventory to 0 and clears active workpiece.
   - Publisher:
     - `/workcell/inventory` (`std_msgs/msg/Int32` or domain JSON): Emits current tower count on change.

3. **TDD Verification**:
   - Unit tests in `src/ros2/workcell_manager/test/test_workcell_node.py` (via `pytest`):
     - Assert consecutive calls to `get_drop_slot` increment $z_k$ up to 10 slots.
     - Assert 11th call sets `overflow_occurred = True` with FIFO bottom-drop behavior.
     - Assert `clear_workspace` resets inventory to 0.

---

## Step 3: Standalone Arm Controller Action Server (Refactor-A.2)

Implement `arm_controller_node` wrapping analytical IK and exposing `PickAndPlace.action` server to command `scaled_joint_trajectory_controller`.

1. **Package Scaffolding**:
   - Location: `src/ros2/arm_controller/` (`ament_python` package)
   - Executable: `arm_controller_node` (`arm_controller.arm_controller_node:main`)
   - Math Module: Transfer `kinematics.py` from `src/edge_node/kinematics.py` into `src/ros2/arm_controller/arm_controller/kinematics.py`.

2. **Node Implementation**:
   - Class: `ArmControllerNode(Node)`
   - Action Server:
     - Exposes `/arm_controller/pick_and_place` (`PickAndPlace.action`).
     - Accepts goal with Cartesian `pick_coords` and optional `drop_coords`.
     - Queries `/workcell/get_drop_slot` if `drop_coords` not specified.
     - Calls `AnalyticalInverseKinematics` to solve 10-step waypoint trajectory:
       1. `APPROACH_PICK` ($z + 0.10\text{m}$)
       2. `PICK` ($z$)
       3. `GRASP` (palm actuation pause)
       4. `LIFT` ($z + 0.10\text{m}$)
       5. `APPROACH_DROP` ($z_{\text{drop}} + 0.10\text{m}$)
       6. `DROP` ($z_{\text{drop}}$)
       7. `RELEASE` (palm release pause)
       8. `RETREAT_DROP` ($z_{\text{drop}} + 0.10\text{m}$)
       9. `HOME`
       10. `IDLE`
   - Action Client:
     - Connects to `/scaled_joint_trajectory_controller/follow_joint_trajectory` (`control_msgs/action/FollowJointTrajectory`).
     - Packages waypoints with appropriate velocity profiling and time offsets.
   - Feedback & Cancellation:
     - Publishes live feedback `phase` and `percent_complete` at each step.
     - Implements goal cancellation: aborts active trajectory and brings arm to safe stop.

3. **TDD Verification**:
   - Unit tests in `src/ros2/arm_controller/test/test_arm_controller.py`:
     - Assert valid goal generates 10 waypoints with downward tool orientation.
     - Assert out-of-reach pick coordinates reject goal with error message.
     - Assert cancel request cleanly aborts trajectory client.

---

## Step 4: Robotics Bringup & Launch Configuration (Refactor-A.3)

Package all robotics nodes, hardware drivers, and controller managers into a single standard ROS2 launch file.

1. **Package Scaffolding**:
   - Location: `src/ros2/robot_bringup/`
   - Launch File: `src/ros2/robot_bringup/launch/robot_nodes.launch.py`

2. **Launch Node Composition**:
   - Parameter: `use_fake_hardware` (default: `'true'`).
   - `robot_state_publisher`: Uses official UR5e URDF from `ur_description`.
   - `controller_manager`: Starts `ros2_control_node` with either `mock_components/GenericSystem` or physical UR RTDE driver.
   - Spawners:
     - `joint_state_broadcaster` (publishes `/joint_states` at 500 Hz).
     - `scaled_joint_trajectory_controller`.
   - `workcell_node` (from `workcell_manager`).
   - `arm_controller_node` (from `arm_controller`).

3. **TDD Verification**:
   - Test launch: `ros2 launch robot_bringup robot_nodes.launch.py use_fake_hardware:=true`
   - Assert: `ros2 topic hz /joint_states` reports ~500 Hz.
   - Assert: `ros2 node list` includes `controller_manager`, `workcell_node`, and `arm_controller_node`.

---

## Step 5: Gateway Throttler, Action Bridge & Launcher (Refactor-A.4)

Install `zenoh-bridge-ros2dds` via Cargo, create `scripts/launch_gateway.sh`, and enhance Rust Gateway with a 500Hz-to-30Hz decimation filter and Action translation.

1. **Zenoh Bridge Installation**:
   - Install command: `cargo install zenoh-bridge-ros2dds --locked`
   - Binary location: `~/.cargo/bin/zenoh-bridge-ros2dds`

2. **Gateway Launcher**:
   - Script: `scripts/launch_gateway.sh`:
     - Starts `zenoh-bridge-ros2dds` in background.
     - Runs `cargo run -p gateway`.
     - Traps `SIGINT`/`SIGTERM` to kill both processes cleanly on exit.

3. **Telemetry Throttler (500 Hz to 30 Hz)**:
   - Location: `src/gateway/src/throttler.rs`
   - Ingests 500 Hz `/joint_states` from Zenoh topic mirror.
   - Implements non-blocking latest-sample decimation timer ticking at 33ms (30 Hz).
   - Emits structured `RobotTelemetryEvent` to WebSocket ActiveSession.

4. **Action Feedback & Command Ingress**:
   - Ingests incoming `PICK_AND_PLACE_TARGET` WebSocket command.
   - Dispatches Action goal to Zenoh action topic mirror `/arm_controller/pick_and_place/_action/...`.
   - Subscribes to Action feedback and forwards progress frames to WebSocket client.

5. **TDD Verification**:
   - `cargo nextest run -p gateway`:
     - Assert throttler fed at 500 Hz emits exactly 30 Hz ($\pm 2\text{Hz}$) to WebSocket mock.
     - Assert Action feedback frames serialize correctly.

---

## Step 6: Multi-Service Integration Verification & Migration (Refactor-A.5)

Verify the complete multi-tier system with dedicated log streams, validate Playwright integration, and retire legacy prototype code.

1. **Per-Service Launch Workflow**:
   - Terminal 1 (Robotics): `ros2 launch robot_bringup robot_nodes.launch.py use_fake_hardware:=true`
   - Terminal 2 (Gateway + Zenoh): `bash scripts/launch_gateway.sh`
   - Terminal 3 (Web UI): `npm --prefix web run dev` (or `bash scripts/launch_teleop-client.sh`)

2. **Multi-Service Integration Suite**:
   - Update `web/tests/e2e/support/harness.ts` to orchestrate `robot_nodes.launch.py`, `zenoh-bridge-ros2dds`, and `gateway`.
   - Run Playwright E2E suite:
     - Table click triggers `PICK_AND_PLACE_TARGET`.
     - Gateway validates and forwards Action goal.
     - `arm_controller_node` plans analytical IK and dispatches trajectory.
     - 500 Hz simulation controller executes joint motion; Gateway throttles to 30 Hz.
     - KinematicLinkAttachment stacks gear on SpindleTower.
     - Telemetry latency confirms $<50\text{ms}$ end-to-end budget.

3. **Legacy Clean-up**:
   - Retire deprecated `src/edge_node/` prototype files (`main.py`, `node.py`, `mock_publisher.py`).
   - Verify `cargo test --workspace` and `colcon test` pass cleanly.
