"""Standalone Arm Controller Action Server & Analytical IK Dispatcher.

Per ADR 0004 & Unit Refactoring-A (hand-sim-z7uz):
- Exposes /arm_controller/pick_and_place ActionServer (PickAndPlace.action).
- Wraps AnalyticalInverseKinematics solver (<0.2ms execution).
- Plans 10-step waypoint trajectory with downward tool orientation and angular unwrapping.
- Queries /workcell/get_drop_slot when custom drop coords are not provided.
- Dispatches trajectory to /scaled_joint_trajectory_controller/follow_joint_trajectory.
- Emits real-time action feedback phases (APPROACHING through HOMING).
- Supports goal cancellation: aborts active trajectory and brings arm to safe stop.
- Enforces mutual exclusion across concurrent goal requests.
"""

import threading
import time
from typing import Optional


from builtin_interfaces.msg import Duration
from control_msgs.action import FollowJointTrajectory
import rclpy
from rclpy.action import ActionClient, ActionServer, CancelResponse, GoalResponse
from rclpy.callback_groups import ReentrantCallbackGroup
from rclpy.executors import ExternalShutdownException, MultiThreadedExecutor
from rclpy.node import Node
from rclpy.qos import qos_profile_sensor_data
from sensor_msgs.msg import JointState
from trajectory_msgs.msg import JointTrajectoryPoint

from arm_controller.kinematics import (
    APPROACH_LIFT_OFFSET_M,
    CANONICAL_UR5E_JOINTS,
    DEFAULT_TCP_OFFSET_M,
    HOME_JOINT_POSITIONS,
    AnalyticalInverseKinematics,
    OutOfReachError,
    PickAndPlaceTrajectoryGenerator,
    WaypointStep,
)
from robot_control_interfaces.action import PickAndPlace
from robot_control_interfaces.srv import GetDropSlot

MAX_JOINT_VELOCITY_RAD_S: float = 2.0


def seconds_to_duration(seconds: float) -> Duration:
    """Converts floating-point seconds into builtin_interfaces Duration."""
    sec = int(seconds)
    nanosec = int((seconds - sec) * 1e9)
    return Duration(sec=sec, nanosec=nanosec)


class ArmControllerNode(Node):
    """ROS2 node commanding UR5e trajectory execution for pick-and-place tasks."""

    def __init__(self, node_name: str = "arm_controller_node", **kwargs) -> None:
        super().__init__(node_name, **kwargs)

        self.declare_parameter("controller_action_name", "/scaled_joint_trajectory_controller/follow_joint_trajectory")
        self.declare_parameter("pick_and_place_action_name", "/arm_controller/pick_and_place")
        self.declare_parameter("get_drop_slot_service_name", "/workcell/get_drop_slot")
        self.declare_parameter("joint_states_topic", "/joint_states")
        self.declare_parameter("tcp_offset", DEFAULT_TCP_OFFSET_M)
        self.declare_parameter("step_duration", 0.5)
        self.declare_parameter("require_controller", False)
        self.declare_parameter("traj_connect_timeout", 1.0)
        self.declare_parameter("max_joint_velocity", MAX_JOINT_VELOCITY_RAD_S)

        self._controller_action_name = str(self.get_parameter("controller_action_name").value)
        self._pick_and_place_action_name = str(self.get_parameter("pick_and_place_action_name").value)
        self._get_drop_slot_service_name = str(self.get_parameter("get_drop_slot_service_name").value)
        self._joint_states_topic = str(self.get_parameter("joint_states_topic").value)
        self._tcp_offset = float(self.get_parameter("tcp_offset").value)
        self._step_duration = float(self.get_parameter("step_duration").value)
        self._require_controller = bool(self.get_parameter("require_controller").value)
        self._traj_connect_timeout = float(self.get_parameter("traj_connect_timeout").value)
        self._max_joint_velocity = float(self.get_parameter("max_joint_velocity").value)

        self._cb_group = ReentrantCallbackGroup()
        self._lock = threading.Lock()
        self._current_joints: list[float] = list(HOME_JOINT_POSITIONS)
        self._active_goal_handle = None
        self._active_traj_handle = None

        # Telemetry parsing cache for zero-alloc 100 Hz sim ingestion (500 Hz only on real UR)
        self._cached_joint_names: Optional[list[str]] = None
        self._cached_joint_indices: Optional[list[int]] = None

        # Kinematics engine
        self.solver = AnalyticalInverseKinematics(tcp_offset=self._tcp_offset)
        self.trajectory_generator = PickAndPlaceTrajectoryGenerator(solver=self.solver)

        # Lazy joint subscription: stays None while parked idle so idle launch
        # yields zero joint-state callbacks. Created on first accepted goal.
        # BEST_EFFORT QoS matching 100 Hz sim driver (500 Hz only on real UR).
        self._joint_sub = None

        # Drop slot service client
        self._drop_slot_client = self.create_client(
            GetDropSlot,
            self._get_drop_slot_service_name,
            callback_group=self._cb_group,
        )

        # Trajectory controller action client
        self._traj_client = ActionClient(
            self,
            FollowJointTrajectory,
            self._controller_action_name,
            callback_group=self._cb_group,
        )

        # Pick and place action server
        self._action_server = ActionServer(
            self,
            PickAndPlace,
            self._pick_and_place_action_name,
            execute_callback=self.execute_pick_and_place,
            goal_callback=self.handle_goal_request,
            cancel_callback=self.handle_cancel_request,
            callback_group=self._cb_group,
        )

        self.get_logger().info(
            f"ArmControllerNode initialized. Action: {self._pick_and_place_action_name}, "
            f"Controller: {self._controller_action_name}"
        )

    @property
    def current_joints(self) -> list[float]:
        """Returns current 6-DoF joint positions in canonical order."""
        with self._lock:
            return list(self._current_joints)

    def set_current_joints(self, joints: list[float]) -> None:
        """Explicitly sets current joint positions (used in tests or manual overrides)."""
        if len(joints) != 6:
            raise ValueError(f"Expected 6 joint angles; received {len(joints)}")
        with self._lock:
            self._current_joints = list(joints)

    def _ensure_joint_subscription(self) -> None:
        """Creates /joint_states subscription on first accepted goal (idempotent)."""
        with self._lock:
            if self._joint_sub is not None:
                return
        sub = self.create_subscription(
            JointState,
            self._joint_states_topic,
            self._handle_joint_states,
            qos_profile_sensor_data,
            callback_group=self._cb_group,
        )
        with self._lock:
            if self._joint_sub is None:
                self._joint_sub = sub
            else:
                self.destroy_subscription(sub)

    def _handle_joint_states(self, msg: JointState) -> None:
        """Extracts canonical UR5e joint angles from incoming JointState message with O(1) cached lookup."""
        if not msg.name or not msg.position:
            return

        # Cache index permutation on first message or if joint names list changes
        if msg.name != self._cached_joint_names:
            try:
                indices = [msg.name.index(joint) for joint in CANONICAL_UR5E_JOINTS]
                self._cached_joint_indices = indices
                self._cached_joint_names = list(msg.name)
            except ValueError:
                return

        if self._cached_joint_indices is not None:
            positions = msg.position
            with self._lock:
                self._current_joints = [float(positions[idx]) for idx in self._cached_joint_indices]

    def handle_goal_request(self, goal_request: PickAndPlace.Goal) -> GoalResponse:
        """Evaluates incoming PickAndPlace goal request, enforcing single-goal mutual exclusion."""
        with self._lock:
            if self._active_goal_handle is not None and self._active_goal_handle.is_active:
                self.get_logger().warning(
                    f"Rejecting goal '{goal_request.command_id}': another PickAndPlace goal is actively executing"
                )
                return GoalResponse.REJECT

        self._ensure_joint_subscription()
        self.get_logger().info(
            f"Accepting goal request: pick=({goal_request.pick_coords.x:.3f}, "
            f"{goal_request.pick_coords.y:.3f}, {goal_request.pick_coords.z:.3f}), "
            f"custom_drop={goal_request.use_custom_drop}, cmd='{goal_request.command_id}'"
        )
        return GoalResponse.ACCEPT

    def handle_cancel_request(self, goal_handle) -> CancelResponse:
        """Processes goal cancellation request."""
        self.get_logger().info("Received cancellation request for PickAndPlace goal")
        with self._lock:
            if self._active_traj_handle is not None:
                self._active_traj_handle.cancel_goal_async()
        return CancelResponse.ACCEPT

    def build_joint_trajectory_goal(
        self, waypoints: list[WaypointStep], initial_joints: list[float]
    ) -> FollowJointTrajectory.Goal:
        """Builds FollowJointTrajectory.Goal with velocity-aware timing and canonical joint names."""
        goal = FollowJointTrajectory.Goal()
        goal.trajectory.joint_names = list(CANONICAL_UR5E_JOINTS)

        cumulative_time = 0.0
        prev_joints = initial_joints

        for step in waypoints:
            if step.pause_duration_s > 0.0:
                duration = step.pause_duration_s
            else:
                max_dq = max(abs(step.joint_positions[i] - prev_joints[i]) for i in range(6))
                min_time = max_dq / self._max_joint_velocity if self._max_joint_velocity > 0 else 0.0
                duration = max(self._step_duration, min_time)

            cumulative_time += duration
            prev_joints = step.joint_positions

            pt = JointTrajectoryPoint()
            pt.positions = [float(q) for q in step.joint_positions]
            pt.velocities = [0.0] * 6
            pt.time_from_start = seconds_to_duration(cumulative_time)
            goal.trajectory.points.append(pt)

        return goal

    def build_safe_stop_goal(self, current_joints: list[float]) -> FollowJointTrajectory.Goal:
        """Generates immediate safe-stop trajectory holding current position."""
        goal = FollowJointTrajectory.Goal()
        goal.trajectory.joint_names = list(CANONICAL_UR5E_JOINTS)
        pt = JointTrajectoryPoint()
        pt.positions = [float(q) for q in current_joints]
        pt.velocities = [0.0] * 6
        pt.time_from_start = seconds_to_duration(0.1)
        goal.trajectory.points.append(pt)
        return goal

    def command_safe_stop(self) -> None:
        """Commands smooth safe stop deceleration to scaled_joint_trajectory_controller."""
        with self._lock:
            q_stop = list(self._current_joints)
        stop_goal = self.build_safe_stop_goal(q_stop)
        if self._traj_client.server_is_ready():
            self._traj_client.send_goal_async(stop_goal)
            self.get_logger().info("Safe stop trajectory commanded")

    def execute_pick_and_place(self, goal_handle) -> PickAndPlace.Result:
        """Executes 10-step pick and place action sequence with real-time feedback."""
        with self._lock:
            self._active_goal_handle = goal_handle

        req: PickAndPlace.Goal = goal_handle.request
        result = PickAndPlace.Result()

        try:
            pick_coords = (req.pick_coords.x, req.pick_coords.y, req.pick_coords.z)

            # Determine drop coordinates
            if req.use_custom_drop:
                drop_coords = (req.drop_coords.x, req.drop_coords.y, req.drop_coords.z)
            else:
                # Dynamic drop slot query
                if not self._drop_slot_client.wait_for_service(timeout_sec=1.0):
                    self.get_logger().error("GetDropSlot service not available on /workcell/get_drop_slot")
                    goal_handle.abort()
                    result.success = False
                    result.message = "GetDropSlot service not available"
                    return result

                get_drop_req = GetDropSlot.Request()
                drop_future = self._drop_slot_client.call_async(get_drop_req)
                start_t = time.time()
                while not drop_future.done() and time.time() - start_t < 2.0:
                    time.sleep(0.01)

                if not drop_future.done() or drop_future.result() is None:
                    self.get_logger().error("Failed to query drop slot from /workcell/get_drop_slot")
                    goal_handle.abort()
                    result.success = False
                    result.message = "Failed to query drop slot"
                    return result

                drop_res = drop_future.result()
                drop_coords = (drop_res.drop_coords.x, drop_res.drop_coords.y, drop_res.drop_coords.z)
                self.get_logger().info(
                    f"Queried drop slot: ({drop_res.drop_coords.x:.3f}, {drop_res.drop_coords.y:.3f}, {drop_res.drop_coords.z:.3f}), "
                    f"slot={drop_res.slot_index}, overflow={drop_res.overflow_occurred}"
                )

            self.get_logger().info(
                f"Executing PickAndPlace: pick={pick_coords}, drop={drop_coords}, cmd='{req.command_id}'"
            )

            # Validate reachability
            try:
                self.solver.check_reachability(*pick_coords)
                self.solver.check_reachability(pick_coords[0], pick_coords[1], pick_coords[2] + APPROACH_LIFT_OFFSET_M)
                self.solver.check_reachability(*drop_coords)
                self.solver.check_reachability(drop_coords[0], drop_coords[1], drop_coords[2] + APPROACH_LIFT_OFFSET_M)
            except OutOfReachError as err:
                self.get_logger().warning(f"Target coordinate out of reach: {err}")
                goal_handle.abort()
                result.success = False
                result.message = f"Target coordinate out of reach: {err}"
                return result

            # Compute 10-step waypoint trajectory
            with self._lock:
                q_init = list(self._current_joints)
            try:
                waypoints = self.trajectory_generator.generate_trajectory(
                    pick_coords=pick_coords,
                    drop_coords=drop_coords,
                    current_joints=q_init,
                )
            except Exception as err:
                self.get_logger().error(f"Kinematics trajectory computation failed: {err}")
                goal_handle.abort()
                result.success = False
                result.message = f"Kinematics error: {err}"
                return result

            # Connect to controller
            controller_connected = self._traj_client.wait_for_server(timeout_sec=self._traj_connect_timeout)
            if self._require_controller and not controller_connected:
                self.get_logger().error("Required FollowJointTrajectory action server not available")
                goal_handle.abort()
                result.success = False
                result.message = "Controller action server not connected"
                return result

            traj_goal = self.build_joint_trajectory_goal(waypoints, q_init)
            traj_result_future = None

            if controller_connected:
                self.get_logger().info("Dispatching trajectory goal to FollowJointTrajectory client")
                send_goal_future = self._traj_client.send_goal_async(traj_goal)
                start_t = time.time()
                while not send_goal_future.done() and time.time() - start_t < 2.0:
                    time.sleep(0.01)

                if not send_goal_future.done():
                    self.get_logger().error("Timeout waiting for controller goal response")
                    goal_handle.abort()
                    result.success = False
                    result.message = "Controller action server timeout"
                    return result

                active_handle = send_goal_future.result()
                if active_handle is None or not active_handle.accepted:
                    self.get_logger().error("Controller rejected FollowJointTrajectory goal")
                    goal_handle.abort()
                    result.success = False
                    result.message = "Controller rejected trajectory goal"
                    return result

                with self._lock:
                    self._active_traj_handle = active_handle
                traj_result_future = active_handle.get_result_async()

            # Step through waypoints emitting real-time feedback phases
            prev_q = q_init
            for step in waypoints:
                # Cancellation check
                if goal_handle.is_cancel_requested:
                    self.get_logger().info("PickAndPlace goal canceled during execution")
                    with self._lock:
                        if self._active_traj_handle is not None:
                            self._active_traj_handle.cancel_goal_async()
                    self.command_safe_stop()
                    goal_handle.canceled()
                    result.success = False
                    result.message = "Goal canceled"
                    return result

                # Emit real-time action feedback phase
                feedback = PickAndPlace.Feedback()
                feedback.phase = step.phase
                feedback.percent_complete = float(step.percent_complete)
                try:
                    goal_handle.publish_feedback(feedback)
                except Exception:
                    pass
                self.get_logger().debug(
                    f"Feedback: {feedback.phase} ({feedback.percent_complete:.1f}%)"
                )

                if step.pause_duration_s > 0.0:
                    step_time = step.pause_duration_s if self._step_duration > 0.05 else self._step_duration
                else:
                    if self._step_duration <= 0.05:
                        step_time = self._step_duration
                    else:
                        max_dq = max(abs(step.joint_positions[i] - prev_q[i]) for i in range(6))
                        min_time = max_dq / self._max_joint_velocity if self._max_joint_velocity > 0 else 0.0
                        step_time = max(self._step_duration, min_time)
                prev_q = step.joint_positions


                # Interruptible wait checking cancellation and controller failure
                step_elapsed = 0.0
                dt_wait = 0.02
                while step_elapsed < step_time:
                    if goal_handle.is_cancel_requested:
                        self.get_logger().info("PickAndPlace goal canceled during step wait")
                        with self._lock:
                            if self._active_traj_handle is not None:
                                self._active_traj_handle.cancel_goal_async()
                        self.command_safe_stop()
                        goal_handle.canceled()
                        result.success = False
                        result.message = "Goal canceled"
                        return result

                    if traj_result_future is not None and traj_result_future.done():
                        traj_res = traj_result_future.result()
                        if traj_res.result.error_code != FollowJointTrajectory.Result.SUCCESSFUL:
                            self.get_logger().error(
                                f"Controller aborted trajectory with error code {traj_res.result.error_code}: {traj_res.result.error_string}"
                            )
                            goal_handle.abort()
                            result.success = False
                            result.message = f"Controller error: {traj_res.result.error_string}"
                            return result

                    time.sleep(min(dt_wait, step_time - step_elapsed))
                    step_elapsed += dt_wait

            # Terminal cancellation check
            if goal_handle.is_cancel_requested:
                with self._lock:
                    if self._active_traj_handle is not None:
                        self._active_traj_handle.cancel_goal_async()
                self.command_safe_stop()
                goal_handle.canceled()
                result.success = False
                result.message = "Goal canceled"
                return result

            # If controller connected, wait for controller confirmation if not yet done
            if traj_result_future is not None and not traj_result_future.done():
                start_t = time.time()
                while not traj_result_future.done() and time.time() - start_t < 2.0:
                    time.sleep(0.01)

            goal_handle.succeed()
            result.success = True
            result.message = "Pick and place completed successfully"
            self.get_logger().info("PickAndPlace goal succeeded successfully")
            return result
        finally:
            with self._lock:
                self._active_goal_handle = None
                self._active_traj_handle = None



def main(args: list[str] | None = None) -> None:
    """Entry point for standalone arm_controller_node."""
    rclpy.init(args=args)
    node = ArmControllerNode()
    executor = MultiThreadedExecutor()
    executor.add_node(node)
    try:
        executor.spin()
    except (KeyboardInterrupt, ExternalShutdownException):
        pass
    finally:
        node.destroy_node()
        if rclpy.ok():
            rclpy.shutdown()


if __name__ == "__main__":
    main()
