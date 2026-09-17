# Unit 6.5-Refactoring: Real-Robot Native ROS2 Architecture & Gateway 500Hz-to-30Hz Throttling

> [!NOTE]
> Based on architectural agreement recorded in [ADR 0004](../../docs/adr/0004-real-robot-ros2-native-architecture-and-gateway-throttling.md). See detailed specifications in [unit_refactoring-a/overview.md](./unit_refactoring-a/overview.md) and [unit_refactoring-a/implementation_wireframe.md](./unit_refactoring-a/implementation_wireframe.md).

---

## 1. Objectives
Refactor the simulated prototype backend into a production-grade, real-hardware-ready ROS2 native architecture while maintaining the existing Web visualizer contracts and Rust Gateway security boundaries.

---

## 2. Core Architecture Specifications

### Component 1: `workcell_node` (Python / `rclpy`)
- **Location**: `src/edge_node/workcell_node.py` (or dedicated package `workcell_manager`)
- **State Responsibility**:
  - Tracks SpindleTower inventory and gear stacking order ($z_k = (k \pmod{10}) \times 0.02\text{m}$).
  - Tracks active workpiece presence and table coordinates.
- **Interfaces**:
  - `GetDropSlot.srv`: Computes next vacant drop slot Cartesian coordinates $(x, y, z)$.
  - `ClearWorkspace.srv`: Resets active workpiece and tower inventory.
  - `/workcell/inventory` (Topic): Emits current placed gear count and state.

### Component 2: `arm_controller_node` (Python / `rclpy`)
- **Location**: `src/edge_node/arm_controller_node.py`
- **Interfaces**:
  - Action Server: `PickAndPlace.action`
    - Goal: `pick_coords` $(x,y,z)$, optional `drop_coords` $(x,y,z)$, `command_id`
    - Feedback: `phase` (`APPROACHING`, `PICKING`, `GRASPING`, `LIFTING`, `TRANSFERRING`, `DROPPING`, `RELEASING`, `RETREATING`, `HOMING`), `percent_complete`
    - Result: `success` (bool), `message` (string)
- **Kinematics Engine**:
  - Reuses analytical closed-form UR5e IK solver from `src/edge_node/kinematics.py` (<0.2ms execution).
- **Execution**:
  - Action Client to `/scaled_joint_trajectory_controller/follow_joint_trajectory` (`control_msgs/action/FollowJointTrajectory`).
  - Packages 10-step waypoint trajectory with timestamps and velocity scaling.

### Component 3: Hardware Interface & Driver Seam (Pre-Packaged C++)
- Uses official `ur_robot_driver` + `ros2_control`:
  - Production: Points to physical UR5e IP (500 Hz RTDE loop on PREEMPT_RT Linux).
  - CI / Development: `mock_components/GenericSystem` (`use_fake_hardware:=true`).
- Manages hardware safety stops and smooth 500 Hz joint trajectory interpolation.

### Component 4: Protocol Bridge (`zenoh-bridge-ros2dds`)
- Upstream standalone daemon.
- Zero custom code; automatically mirrors ROS2 DDS topics, services, and actions into Zenoh key expressions.

### Component 5: Gateway Throttling & Session Management (Rust / Actix-Web)
- **Location**: `src/gateway/`
- **ActiveSession**: Preserves exclusive single-client lease (`409 Conflict`).
- **Telemetry Throttler**:
  - Subscribes to 500 Hz joint states via Zenoh DDS bridge.
  - Samples latest state at 30 Hz (33ms tick interval) to deliver to WebSockets.
- **Action Ingress & Feedback**:
  - Ingests `PICK_AND_PLACE_TARGET` WebSocket frame.
  - Triggers `PickAndPlace.action` goal.
  - Streams Action feedback frames to Web UI for live progress visualization.
- **Hardware Emergency Stop**:
  - Triggers `ur_robot_driver/stop` hardware brake engagement.

---

## 3. Phased Implementation Checklist

1. [ ] **Stage 0: ROS2 Interfaces Package**:
   - Create custom ROS2 interface package `robot_control_interfaces` containing `PickAndPlace.action`, `GetDropSlot.srv`, and `ClearWorkspace.srv`.
2. [ ] **Stage 1: Workcell Node Promotion**:
   - Promote `WorkcellState` logic into standalone `workcell_node`.
   - Verify service and topic endpoints via ROS2 CLI (`ros2 service call`, `ros2 topic echo`).
3. [ ] **Stage 2: Arm Controller Action Server**:
   - Implement `arm_controller_node` wrapping analytical IK and `FollowJointTrajectoryActionClient`.
   - Test against `mock_components/GenericSystem` in ROS2 test harness.
4. [ ] **Stage 3: Gateway 500Hz-to-30Hz Throttler**:
   - Add latest-sample decimation buffer in Rust Gateway.
   - Forward Action feedback frames over WebSocket.
5. [ ] **Stage 4: End-to-End System Verification**:
   - Run multi-service integration suite asserting 30 Hz WebSocket telemetry, action cancellation, and E-Stop brake trigger.
