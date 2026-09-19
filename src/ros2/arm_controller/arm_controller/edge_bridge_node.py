"""EdgeBridge Node bridging Zenoh DataFabric commands to ROS2 controllers.

Per Unit 6.5-Bugfix.2.1 (hand-sim-o5es) & Unit 6.5-Bugfix.2.2 (hand-sim-1h63):
- Runs rclpy MultiThreadedExecutor alongside Zenoh session subscriber on robot/{id}/command.
- Subscribes to /joint_states lazily on ENGAGE with zero-alloc canonical joint mapping (UR5E_JOINTS).
- Connects to ROS2 ActionClient /scaled_joint_trajectory_controller/follow_joint_trajectory.
- Parks in STANDBY on startup; ENGAGE handshake (from Gateway on WS connect) subscribes joints + homes to CANONICAL_POSES[HOME]; STANDBY parks again.
- Dispatches TRAJECTORY_EXECUTE for CANONICAL_POSES (HOME, READY, INSPECT_POSE) and custom waypoints.
- Bridges PICK_AND_PLACE_TARGET to ROS2 ActionClient /arm_controller/pick_and_place.
- Streams ActionFeedbackFrame to Zenoh on rt/arm_controller/pick_and_place/_action/feedback.
- Dynamically reflects gripper/palm state (is_grasped) during GRASPING and RELEASING phases.
- Bridges SPAWN_OBJECT and CLEAR_WORKSPACE commands to /workcell/spawn_object and /workcell/clear_workspace services.
- Implements non-blocking EMERGENCY_STOP (cancels trajectory & PickAndPlace, sets FAULT) and RESET_FAULT handling.
- Emits RobotTelemetryEvent and ErrorFrame over Zenoh on robot/{id}/telemetry.
"""

import json
import threading
import time
from typing import Any, Optional

from control_msgs.action import FollowJointTrajectory
from controller_manager_msgs.srv import SwitchController
from geometry_msgs.msg import Point
import rclpy
from rclpy.action import ActionClient
from rclpy.callback_groups import MutuallyExclusiveCallbackGroup, ReentrantCallbackGroup
from rclpy.executors import ExternalShutdownException, MultiThreadedExecutor
from rclpy.node import Node
from rclpy.qos import qos_profile_sensor_data
from sensor_msgs.msg import JointState
from trajectory_msgs.msg import JointTrajectoryPoint

from arm_controller.arm_controller_node import seconds_to_duration
from domain import (
    CANONICAL_POSES,
    CANONICAL_UR5E_JOINTS,
    DEFAULT_ROBOT_ID,
    ClearWorkspacePayload,
    CommandType,
    ErrorFrame,
    PalmState,
    PickAndPlaceTargetPayload,
    PoseName,
    RobotCommand,
    RobotState,
    RobotTelemetryEvent,
    SpawnObjectPayload,
    TrajectoryExecutePayload,
    robot_command_topic,
    robot_telemetry_topic,
)
from robot_control_interfaces.action import PickAndPlace
from robot_control_interfaces.srv import ClearWorkspace, SpawnObject


class EdgeBridgeNode(Node):
    """ROS2 node bridging Zenoh DataFabric commands to ROS2 trajectory and pick-and-place action clients."""

    def __init__(
        self,
        node_name: str = "edge_bridge_node",
        zenoh_session: Optional[Any] = None,
        **kwargs,
    ) -> None:
        super().__init__(node_name, **kwargs)

        self.declare_parameter("robot_id", DEFAULT_ROBOT_ID)
        self.declare_parameter(
            "controller_action_name",
            "/scaled_joint_trajectory_controller/follow_joint_trajectory",
        )
        self.declare_parameter(
            "pick_and_place_action_name",
            "/arm_controller/pick_and_place",
        )
        self.declare_parameter(
            "spawn_object_service_name",
            "/workcell/spawn_object",
        )
        self.declare_parameter(
            "clear_workspace_service_name",
            "/workcell/clear_workspace",
        )
        self.declare_parameter(
            "action_feedback_topic",
            "rt/arm_controller/pick_and_place/_action/feedback",
        )
        self.declare_parameter("joint_states_topic", "/joint_states")
        self.declare_parameter("auto_home_on_startup", True)
        self.declare_parameter("auto_connect_zenoh", True)
        self.declare_parameter("traj_connect_timeout", 5.0)
        self.declare_parameter("step_duration", 1.0)
        self.declare_parameter("max_joint_velocity", 2.0)
        self.declare_parameter("switch_service_name", "/controller_manager/switch_controller")
        self.declare_parameter("switch_timeout", 5.0)
        self.declare_parameter("standby_park_timeout", 10.0)

        self._robot_id = str(self.get_parameter("robot_id").value)
        self._controller_action_name = str(self.get_parameter("controller_action_name").value)
        self._pick_and_place_action_name = str(
            self.get_parameter("pick_and_place_action_name").value
        )
        self._spawn_object_service_name = str(
            self.get_parameter("spawn_object_service_name").value
        )
        self._clear_workspace_service_name = str(
            self.get_parameter("clear_workspace_service_name").value
        )
        self._action_feedback_topic = str(
            self.get_parameter("action_feedback_topic").value
        )
        self._joint_states_topic = str(self.get_parameter("joint_states_topic").value)
        self._auto_home_on_startup = bool(self.get_parameter("auto_home_on_startup").value)
        self._auto_connect_zenoh = bool(self.get_parameter("auto_connect_zenoh").value)
        self._traj_connect_timeout = float(self.get_parameter("traj_connect_timeout").value)
        self._step_duration = float(self.get_parameter("step_duration").value)
        self._max_joint_velocity = float(self.get_parameter("max_joint_velocity").value)
        self._switch_service_name = str(self.get_parameter("switch_service_name").value)
        self._switch_timeout = float(self.get_parameter("switch_timeout").value)
        self._standby_park_timeout = float(self.get_parameter("standby_park_timeout").value)

        self._lock = threading.RLock()
        self._cb_group = ReentrantCallbackGroup()
        self._telem_cb_group = MutuallyExclusiveCallbackGroup()

        # State initialization: STANDBY until ENGAGE handshake from Gateway.
        # IDLE means engaged-ready; motion cmds rejected while STANDBY.
        self._robot_state: RobotState = RobotState.STANDBY
        self._is_grasped: bool = False
        self._current_joints: list[float] = list(CANONICAL_POSES[PoseName.HOME])
        self._active_traj_handle: Optional[Any] = None
        self._active_pnp_handle: Optional[Any] = None
        self._homing_done_event = threading.Event()
        self._startup_motion_event = threading.Event()

        # Zero-alloc JointState parsing cache
        self._cached_joint_names: Optional[list[str]] = None
        self._cached_joint_indices: Optional[list[int]] = None

        # ROS2 Subscriptions & Action Clients (joint sub lazy: created on ENGAGE)
        self._joint_sub = None

        self._traj_client = ActionClient(
            self,
            FollowJointTrajectory,
            self._controller_action_name,
            callback_group=self._cb_group,
        )

        self._pnp_client = ActionClient(
            self,
            PickAndPlace,
            self._pick_and_place_action_name,
            callback_group=self._cb_group,
        )

        self._spawn_object_client = self.create_client(
            SpawnObject,
            self._spawn_object_service_name,
            callback_group=self._cb_group,
        )

        self._clear_workspace_client = self.create_client(
            ClearWorkspace,
            self._clear_workspace_service_name,
            callback_group=self._cb_group,
        )

        self._switch_client = self.create_client(
            SwitchController,
            self._switch_service_name,
            callback_group=self._cb_group,
        )

        # Zenoh setup
        self._zenoh_session = zenoh_session
        self._owns_zenoh_session = False
        self._zenoh_sub = None
        self._zenoh_pub = None
        self._zenoh_feedback_pub = None

        self._command_topic = robot_command_topic(self._robot_id)
        self._telemetry_topic = robot_telemetry_topic(self._robot_id)

        self._init_zenoh()

        # No auto-homing on startup: homing deferred until ENGAGE handshake.
        # _auto_home_on_startup now means "home on ENGAGE" (True) vs "IDLE on ENGAGE" (False).
        self._startup_thread: Optional[threading.Thread] = None

    @property
    def robot_id(self) -> str:
        return self._robot_id

    @property
    def robot_state(self) -> RobotState:
        with self._lock:
            return self._robot_state

    @property
    def current_joints(self) -> list[float]:
        with self._lock:
            return list(self._current_joints)

    @property
    def is_grasped(self) -> bool:
        with self._lock:
            return self._is_grasped

    def _init_zenoh(self) -> None:
        """Initializes Zenoh subscriber and publisher on DataFabric topics."""
        if self._zenoh_session is None and self._auto_connect_zenoh:
            try:
                import zenoh

                self._zenoh_session = zenoh.open(zenoh.Config())
                self._owns_zenoh_session = True
                self.get_logger().info("Connected to Eclipse Zenoh session.")
            except Exception as e:
                self.get_logger().warning(
                    f"Failed to open Zenoh session ({e}); running in offline ROS2 mode."
                )
                self._zenoh_session = None

        if self._zenoh_session is not None:
            try:
                self._zenoh_pub = self._zenoh_session.declare_publisher(self._telemetry_topic)
                self._zenoh_feedback_pub = self._zenoh_session.declare_publisher(
                    self._action_feedback_topic
                )
                self._zenoh_sub = self._zenoh_session.declare_subscriber(
                    self._command_topic,
                    self._on_zenoh_command,
                )
                self.get_logger().info(
                    f"EdgeBridge listening on Zenoh '{self._command_topic}', "
                    f"publishing telemetry to '{self._telemetry_topic}', "
                    f"publishing action feedback to '{self._action_feedback_topic}'"
                )
            except Exception as e:
                self.get_logger().error(f"Failed to declare Zenoh entities: {e}")

    def _publish_action_feedback(
        self, command_id: str, phase: str, percent_complete: float
    ) -> None:
        """Publishes structured ActionFeedbackFrame over Zenoh on action_feedback_topic."""
        frame = {
            "type": "ACTION_FEEDBACK",
            "command_id": command_id,
            "phase": phase,
            "percent_complete": float(percent_complete),
            "timestamp_ns": time.time_ns(),
        }
        if self._zenoh_feedback_pub is not None:
            try:
                self._zenoh_feedback_pub.put(json.dumps(frame))
            except Exception as e:
                self.get_logger().error(f"Failed to publish ActionFeedbackFrame to Zenoh: {e}")


    def _on_zenoh_command(self, sample: Any) -> None:
        """Zenoh subscriber callback processing incoming samples from DataFabric."""
        try:
            raw_payload = sample.payload.to_bytes().decode("utf-8")
        except Exception as e:
            self.get_logger().error(f"Failed to decode Zenoh sample: {e}")
            return

        self.handle_command_payload(raw_payload)

    def _handle_joint_states(self, msg: JointState) -> None:
        """Parses /joint_states and maps positions to canonical UR5e joint order."""
        with self._lock:
            if msg.name != self._cached_joint_names:
                try:
                    indices = [msg.name.index(joint) for joint in CANONICAL_UR5E_JOINTS]
                    self._cached_joint_indices = indices
                    self._cached_joint_names = list(msg.name)
                except ValueError:
                    return

            if self._cached_joint_indices is not None:
                positions = msg.position
                if all(idx < len(positions) for idx in self._cached_joint_indices):
                    self._current_joints = [
                        float(positions[idx]) for idx in self._cached_joint_indices
                    ]

    def _run_startup_homing(self) -> None:
        """Runs startup homing to CANONICAL_POSES[HOME] in a background worker."""
        self.get_logger().info(
            f"Waiting up to {self._traj_connect_timeout}s for trajectory controller action server..."
        )
        server_ready = self._traj_client.wait_for_server(timeout_sec=self._traj_connect_timeout)

        if not server_ready:
            self.get_logger().warning(
                "Trajectory controller action server not available for startup homing; setting IDLE"
            )
            with self._lock:
                if self._robot_state == RobotState.BOOTING:
                    self._robot_state = RobotState.IDLE
            self._homing_done_event.set()
            self.publish_telemetry()
            return

        self.get_logger().info("Executing startup auto-homing to CANONICAL_POSES[HOME]...")
        home_target = CANONICAL_POSES[PoseName.HOME]

        with self._lock:
            if self._robot_state != RobotState.BOOTING:
                self._homing_done_event.set()
                return
            self._robot_state = RobotState.EXECUTING

        self._startup_motion_event.clear()
        self._dispatch_trajectory_points(
            [home_target],
            command_id="startup-homing",
            completion_event=self._startup_motion_event,
        )

        # Wait on completion event signaled by action result
        wait_timeout = max(10.0, self._step_duration * 5.0)
        self._startup_motion_event.wait(timeout=wait_timeout)

        with self._lock:
            if self._robot_state == RobotState.BOOTING or self._robot_state == RobotState.EXECUTING:
                self._robot_state = RobotState.IDLE

        self._homing_done_event.set()
        self.publish_telemetry(command_id="startup-homing")
        self.get_logger().info("Startup auto-homing complete; EdgeBridge state is IDLE.")

    def wait_for_homing(self, timeout_sec: float = 5.0) -> bool:
        """Blocks until startup homing has finished."""
        return self._homing_done_event.wait(timeout=timeout_sec)

    def _switch_controllers(
        self, activate: list[str], deactivate: list[str]
    ) -> bool:
        """Activates/deactivates controllers via switch_controller (BEST_EFFORT).

        Controllers spawn --inactive (parked: no /joint_states traffic).
        ENGAGE activates both; STANDBY deactivates both. Returns False
        (warning logged) when service missing — motion then fails loudly
        at action-server wait instead of silently.
        """
        if not self._switch_client.wait_for_service(timeout_sec=self._switch_timeout):
            self.get_logger().warning(
                f"switch_controller unavailable after {self._switch_timeout}s; "
                "controllers stay parked"
            )
            return False
        req = SwitchController.Request()
        req.activate_controllers = activate
        req.deactivate_controllers = deactivate
        req.strictness = SwitchController.Request.BEST_EFFORT
        req.activate_asap = True
        req.timeout.sec = int(self._switch_timeout)
        future = self._switch_client.call_async(req)
        # Executor-safe wait: MultiThreadedExecutor already spins this node,
        # so poll future.done() instead of nested spin_until_future_complete
        # (which would raise "node already added to executor" from Zenoh thread).
        deadline = time.monotonic() + self._switch_timeout + 2.0
        while not future.done() and time.monotonic() < deadline:
            time.sleep(0.05)
        if not future.done():
            self.get_logger().warning("switch_controller call timed out")
            return False
        if not future.result().ok:
            self.get_logger().warning(
                f"switch_controller rejected: {future.result().message}"
            )
            return False
        return True

    def handle_engage(self, command_id: Optional[str] = None) -> RobotTelemetryEvent:
        """ENGAGE handshake: activate controllers, subscribe joints, home, go IDLE.

        Strict order: (1) switch controllers active, (2) subscribe joints
        lazily, (3) home via existing homing path. A rejected/unavailable
        switch aborts parked: no joint subscription, no homing thread,
        state back to STANDBY plus a standby error frame.
        """
        with self._lock:
            if self._robot_state == RobotState.IDLE:
                return self.publish_telemetry(command_id=command_id)
            if self._robot_state not in (RobotState.STANDBY, RobotState.BOOTING):
                self._publish_error(
                    "ROBOT_BUSY",
                    f"Robot is currently {self._robot_state.value}; ENGAGE rejected",
                )
                return self.publish_telemetry(command_id=command_id)
            self._robot_state = RobotState.BOOTING
            self._homing_done_event.clear()
            self._startup_motion_event.clear()
            need_sub = self._joint_sub is None
            need_homing_thread = (
                self._startup_thread is None or not self._startup_thread.is_alive()
            )

        self.get_logger().info("ENGAGE step 1/3: activating controllers...")
        switched = self._switch_controllers(
            activate=["joint_state_broadcaster", "scaled_joint_trajectory_controller"],
            deactivate=[],
        )
        if not switched:
            self.get_logger().warning(
                "ENGAGE step 1/3 failed: switch_controller rejected/unavailable; "
                "staying parked in STANDBY"
            )
            with self._lock:
                self._robot_state = RobotState.STANDBY
            self._homing_done_event.set()
            self._publish_error(
                "SWITCH_CONTROLLER_FAILED",
                "switch_controller activation failed; arm stays parked in STANDBY",
            )
            return self.publish_telemetry(command_id=command_id)
        self.get_logger().info("ENGAGE step 1/3 done: controllers active")

        if need_sub:
            self.get_logger().info("ENGAGE step 2/3: subscribing to joint states...")
            self._joint_sub = self.create_subscription(
                JointState,
                self._joint_states_topic,
                self._handle_joint_states,
                qos_profile_sensor_data,
                callback_group=self._telem_cb_group,
            )
            self.get_logger().info("ENGAGE step 2/3 done: joint subscription active")
        else:
            self.get_logger().info(
                "ENGAGE step 2/3 skipped: sub already active"
            )

        if need_homing_thread:
            if self._auto_home_on_startup:
                self.get_logger().info("ENGAGE step 3/3: starting homing thread...")
                self._startup_thread = threading.Thread(
                    target=self._run_startup_homing,
                    name="edge_bridge_homing",
                    daemon=True,
                )
                self._startup_thread.start()
            else:
                self.get_logger().info(
                    "ENGAGE step 3/3 skipped: homing off, going IDLE"
                )
                with self._lock:
                    self._robot_state = RobotState.IDLE
                self._homing_done_event.set()
                return self.publish_telemetry(command_id=command_id)
        else:
            self.get_logger().info(
                "ENGAGE step 3/3 skipped: homing already in progress"
            )

        return self.publish_telemetry(command_id=command_id)

    def handle_standby(self, command_id: Optional[str] = None) -> RobotTelemetryEvent:
        """STANDBY handshake: cancel goals, park home if mid-motion, drop sub, park in STANDBY.

        Order: (1) cancel active trajectory + PickAndPlace goals, (2) send one
        home park goal when the previous state was EXECUTING (skipped while
        ready), bounded by standby_park_timeout, (3) drop the joint
        subscription, (4) deactivate controllers. Park/deactivate failures are
        warnings; state always ends STANDBY.
        """
        with self._lock:
            prev_state = self._robot_state
            active_handle = self._active_traj_handle
            self._active_traj_handle = None
            active_pnp = self._active_pnp_handle
            self._active_pnp_handle = None

        for handle, label in ((active_handle, "trajectory"), (active_pnp, "PickAndPlace")):
            if handle is not None:
                try:
                    handle.cancel_goal_async()
                except Exception as e:
                    self.get_logger().warning(f"Failed to cancel active {label}: {e}")

        if prev_state == RobotState.EXECUTING:
            self.get_logger().info("STANDBY: parking to HOME before deactivation...")
            # Park runs while still EXECUTING so the dispatch gate passes and
            # the park result callback is not treated as stale.
            park_done = threading.Event()
            try:
                self._dispatch_trajectory_points(
                    [list(CANONICAL_POSES[PoseName.HOME])],
                    command_id=command_id,
                    completion_event=park_done,
                )
            except Exception as e:
                self.get_logger().warning(f"STANDBY park dispatch failed: {e}; staying parked")
                park_done.set()
            else:
                if not park_done.wait(timeout=self._standby_park_timeout):
                    self.get_logger().warning(
                        f"STANDBY park timed out after {self._standby_park_timeout}s; staying parked"
                    )
                    with self._lock:
                        stray = self._active_traj_handle
                        self._active_traj_handle = None
                    if stray is not None:
                        try:
                            stray.cancel_goal_async()
                        except Exception as e:
                            self.get_logger().warning(f"Failed to cancel stray park goal: {e}")
                else:
                    self.get_logger().info("STANDBY: park to HOME complete")
        else:
            self.get_logger().info(
                f"STANDBY: skipping park (state was {prev_state.value}); deactivating..."
            )

        with self._lock:
            # Park completion may have flipped EXECUTING->IDLE; force STANDBY last
            # so the final state is always parked regardless of callback timing.
            self._robot_state = RobotState.STANDBY
            self._active_traj_handle = None
            self._active_pnp_handle = None
            joint_sub = self._joint_sub
            self._joint_sub = None

        if joint_sub is not None:
            try:
                self.destroy_subscription(joint_sub)
            except Exception:
                pass

        if not self._switch_controllers(
            activate=[],
            deactivate=["scaled_joint_trajectory_controller", "joint_state_broadcaster"],
        ):
            self.get_logger().warning("STANDBY: controller deactivation failed; staying parked")

        return self.publish_telemetry(command_id=command_id)


    def handle_command_payload(self, raw_payload: str | bytes) -> Optional[RobotTelemetryEvent]:
        """Validates JSON schema and dispatches inbound RobotCommand."""
        if isinstance(raw_payload, bytes):
            try:
                raw_payload = raw_payload.decode("utf-8")
            except Exception as e:
                self._publish_error("MALFORMED_PAYLOAD", f"UTF-8 decode failed: {e}")
                return None

        try:
            command = RobotCommand.model_validate_json(raw_payload)
        except Exception as e:
            self._publish_error("SCHEMA_VALIDATION_ERROR", f"Invalid RobotCommand schema: {e}")
            return None

        return self.handle_command(command)

    def handle_command(self, command: RobotCommand) -> Optional[RobotTelemetryEvent]:
        """Processes validated RobotCommand according to operational lifecycle."""
        self.get_logger().info(
            f"Received {command.type.value} command '{command.command_id}' from '{command.sender_id}'"
        )

        if command.type == CommandType.PING:
            return self.publish_telemetry(command_id=command.command_id)

        if command.type == CommandType.EMERGENCY_STOP:
            return self.handle_emergency_stop(command_id=command.command_id)

        if command.type == CommandType.RESET_FAULT:
            return self.handle_reset_fault(command_id=command.command_id)

        if command.type == CommandType.ENGAGE:
            return self.handle_engage(command_id=command.command_id)

        if command.type == CommandType.STANDBY:
            return self.handle_standby(command_id=command.command_id)

        with self._lock:
            standby = self._robot_state == RobotState.STANDBY
        if standby:
            self._publish_error(
                "ROBOT_STANDBY",
                "Robot is in STANDBY; send ENGAGE handshake before motion commands",
            )
            return None

        if command.type == CommandType.TRAJECTORY_EXECUTE:
            with self._lock:
                if self._robot_state == RobotState.FAULT:
                    self._publish_error(
                        "ROBOT_IN_FAULT",
                        "Robot is in FAULT state; must RESET_FAULT before commanding trajectories",
                    )
                    return None
                if self._robot_state != RobotState.IDLE:
                    self._publish_error(
                        "ROBOT_BUSY",
                        f"Robot is currently {self._robot_state.value}; command rejected",
                    )
                    return None

                # Non-blocking controller check
                if not self._traj_client.server_is_ready():
                    self._publish_error(
                        "CONTROLLER_UNAVAILABLE",
                        "FollowJointTrajectory action server is not available",
                    )
                    return None

                try:
                    payload = TrajectoryExecutePayload.model_validate(command.payload)
                except Exception as e:
                    self._publish_error("INVALID_PAYLOAD", f"TrajectoryExecute payload invalid: {e}")
                    return None

                waypoints_to_execute = []
                if payload.pose_name is not None:
                    if payload.pose_name not in CANONICAL_POSES:
                        self._publish_error(
                            "INVALID_POSE_NAME",
                            f"Unknown pose name '{payload.pose_name}'",
                        )
                        return None
                    waypoints_to_execute = [CANONICAL_POSES[payload.pose_name]]
                elif payload.waypoints is not None and len(payload.waypoints) > 0:
                    waypoints_to_execute = payload.waypoints
                else:
                    self._publish_error(
                        "INVALID_PAYLOAD",
                        "Neither pose_name nor waypoints provided in TRAJECTORY_EXECUTE payload",
                    )
                    return None

                # Atomically transition state under lock to prevent TOCTOU race
                self._robot_state = RobotState.EXECUTING

            return self._dispatch_trajectory_points(
                waypoints_to_execute, command_id=command.command_id
            )

        if command.type == CommandType.SPAWN_OBJECT:
            with self._lock:
                if self._robot_state != RobotState.IDLE:
                    self._publish_error(
                        "ROBOT_BUSY",
                        f"Robot is currently {self._robot_state.value}; cannot spawn object",
                    )
                    return None

            try:
                payload = SpawnObjectPayload.model_validate(command.payload)
            except Exception as e:
                self._publish_error("INVALID_PAYLOAD", f"SpawnObject payload invalid: {e}")
                return None

            if not self._spawn_object_client.wait_for_service(timeout_sec=1.0):
                self._publish_error(
                    "SERVICE_UNAVAILABLE",
                    f"SpawnObject service not available at '{self._spawn_object_service_name}'",
                )
                return None

            req = SpawnObject.Request()
            req.coords = Point(x=float(payload.x), y=float(payload.y), z=float(payload.z))
            req.object_type = payload.object_type.value

            future = self._spawn_object_client.call_async(req)
            start_t = time.time()
            while not future.done() and time.time() - start_t < 2.0:
                time.sleep(0.01)

            if not future.done():
                self._publish_error("SERVICE_TIMEOUT", "SpawnObject service call timed out")
                return None

            res = future.result()
            if res is None or not res.success:
                msg = res.message if res else "Unknown service failure"
                self._publish_error("WORKCELL_OCCUPIED", msg)
                return None

            return self.publish_telemetry(command_id=command.command_id)

        if command.type == CommandType.CLEAR_WORKSPACE:
            with self._lock:
                if self._robot_state == RobotState.EXECUTING:
                    self._publish_error(
                        "ROBOT_BUSY",
                        f"Robot is currently {self._robot_state.value}; cannot clear workspace",
                    )
                    return None

            try:
                ClearWorkspacePayload.model_validate(command.payload)
            except Exception as e:
                self._publish_error("INVALID_PAYLOAD", f"ClearWorkspace payload invalid: {e}")
                return None

            if not self._clear_workspace_client.wait_for_service(timeout_sec=1.0):
                self._publish_error(
                    "SERVICE_UNAVAILABLE",
                    f"ClearWorkspace service not available at '{self._clear_workspace_service_name}'",
                )
                return None

            req = ClearWorkspace.Request()
            future = self._clear_workspace_client.call_async(req)
            start_t = time.time()
            while not future.done() and time.time() - start_t < 2.0:
                time.sleep(0.01)

            if not future.done():
                self._publish_error("SERVICE_TIMEOUT", "ClearWorkspace service call timed out")
                return None

            res = future.result()
            if res is None or not res.success:
                msg = res.message if res else "Unknown service failure"
                self._publish_error("SERVICE_ERROR", msg)
                return None

            with self._lock:
                self._is_grasped = False

            return self.publish_telemetry(command_id=command.command_id)

        if command.type == CommandType.PICK_AND_PLACE_TARGET:
            with self._lock:
                if self._robot_state == RobotState.FAULT:
                    self._publish_error(
                        "ROBOT_IN_FAULT",
                        "Robot is in FAULT state; must RESET_FAULT before commanding pick and place",
                    )
                    return None
                if self._robot_state != RobotState.IDLE:
                    self._publish_error(
                        "ROBOT_BUSY",
                        f"Robot is currently {self._robot_state.value}; command rejected",
                    )
                    return None

                if not self._pnp_client.server_is_ready():
                    self._publish_error(
                        "CONTROLLER_UNAVAILABLE",
                        "PickAndPlace action server is not available",
                    )
                    return None

                try:
                    payload = PickAndPlaceTargetPayload.model_validate(command.payload)
                except Exception as e:
                    self._publish_error("INVALID_PAYLOAD", f"PickAndPlaceTarget payload invalid: {e}")
                    return None

                self._robot_state = RobotState.EXECUTING

            return self._dispatch_pick_and_place_goal(
                payload, command_id=command.command_id
            )

        self.get_logger().warning(f"Unsupported command type: {command.type.value}")
        self._publish_error(
            "UNSUPPORTED_COMMAND",
            f"Unsupported command type '{command.type.value}'",
        )
        return None

    def _dispatch_trajectory_points(
        self,
        waypoints: list[list[float]],
        command_id: Optional[str] = None,
        completion_event: Optional[threading.Event] = None,
    ) -> RobotTelemetryEvent:
        """Builds multi-point trajectory with cumulative durations and dispatches to controller."""
        with self._lock:
            q_current = list(self._current_joints)

        goal = FollowJointTrajectory.Goal()
        goal.trajectory.joint_names = list(CANONICAL_UR5E_JOINTS)

        cumulative_time = 0.0
        prev_q = q_current
        for wp in waypoints:
            max_dq = max(abs(wp[i] - prev_q[i]) for i in range(6))
            seg_dur = max(
                self._step_duration,
                max_dq / self._max_joint_velocity if self._max_joint_velocity > 0 else self._step_duration,
            )
            cumulative_time += seg_dur
            prev_q = wp

            pt = JointTrajectoryPoint()
            pt.positions = [float(q) for q in wp]
            pt.velocities = [0.0] * 6
            pt.time_from_start = seconds_to_duration(cumulative_time)
            goal.trajectory.points.append(pt)

        event = self.publish_telemetry(command_id=command_id)

        with self._lock:
            if self._robot_state != RobotState.EXECUTING:
                if completion_event is not None:
                    completion_event.set()
                return event

            send_goal_future = self._traj_client.send_goal_async(goal)

        def on_goal_response(future: Any) -> None:
            try:
                goal_handle = future.result()
            except Exception as err:
                self.get_logger().error(f"Error obtaining goal handle: {err}")
                with self._lock:
                    if self._robot_state == RobotState.EXECUTING:
                        self._robot_state = RobotState.FAULT
                self._publish_error("GOAL_ERROR", str(err))
                self.publish_telemetry()
                if completion_event is not None:
                    completion_event.set()
                return

            if not goal_handle or not goal_handle.accepted:
                self.get_logger().error("Trajectory goal rejected by controller")
                with self._lock:
                    if self._robot_state == RobotState.EXECUTING:
                        self._robot_state = RobotState.FAULT
                self._publish_error("GOAL_REJECTED", "Trajectory goal was rejected by controller")
                self.publish_telemetry()
                if completion_event is not None:
                    completion_event.set()
                return

            with self._lock:
                if self._robot_state == RobotState.EXECUTING:
                    self._active_traj_handle = goal_handle
                else:
                    goal_handle.cancel_goal_async()
                    if completion_event is not None:
                        completion_event.set()
                    return

            res_future = goal_handle.get_result_async()

            def on_result(r_future: Any) -> None:
                should_publish_completion = False
                with self._lock:
                    if self._active_traj_handle is not goal_handle:
                        # Stale result (superseded by STANDBY park or ESTOP); ignore.
                        pass
                    else:
                        self._active_traj_handle = None
                        if self._robot_state == RobotState.EXECUTING:
                            try:
                                traj_res = r_future.result()
                                if traj_res.result.error_code == FollowJointTrajectory.Result.SUCCESSFUL:
                                    self._robot_state = RobotState.IDLE
                                    should_publish_completion = True
                                else:
                                    self.get_logger().error(
                                        f"Trajectory failed with code {traj_res.result.error_code}"
                                    )
                                    self._robot_state = RobotState.FAULT
                            except Exception as err:
                                self.get_logger().error(f"Error reading trajectory result: {err}")
                                self._robot_state = RobotState.FAULT

                if completion_event is not None:
                    completion_event.set()

                if should_publish_completion:
                    self.publish_telemetry(command_id=command_id)

            res_future.add_done_callback(on_result)

        send_goal_future.add_done_callback(on_goal_response)
        return event

    def _dispatch_pick_and_place_goal(
        self,
        payload: PickAndPlaceTargetPayload,
        command_id: Optional[str] = None,
        completion_event: Optional[threading.Event] = None,
    ) -> RobotTelemetryEvent:
        """Builds PickAndPlace goal and dispatches to action server, streaming feedback to Zenoh."""
        goal = PickAndPlace.Goal()
        goal.pick_coords = Point(
            x=float(payload.pick_x),
            y=float(payload.pick_y),
            z=float(payload.pick_z),
        )
        if (
            payload.drop_x is not None
            and payload.drop_y is not None
            and payload.drop_z is not None
        ):
            goal.drop_coords = Point(
                x=float(payload.drop_x),
                y=float(payload.drop_y),
                z=float(payload.drop_z),
            )
            goal.use_custom_drop = True
        else:
            goal.drop_coords = Point(x=0.0, y=0.0, z=0.0)
            goal.use_custom_drop = False
        goal.command_id = command_id or ""

        def on_feedback(feedback_msg: Any) -> None:
            fb = feedback_msg.feedback
            phase = fb.phase
            pct = float(fb.percent_complete)
            state_changed = False

            with self._lock:
                if phase == "GRASPING":
                    if not self._is_grasped:
                        self._is_grasped = True
                        state_changed = True
                elif phase == "RELEASING":
                    if self._is_grasped:
                        self._is_grasped = False
                        state_changed = True

            self._publish_action_feedback(goal.command_id, phase, pct)
            if state_changed:
                self.publish_telemetry(command_id=command_id)

        event = self.publish_telemetry(command_id=command_id)

        with self._lock:
            if self._robot_state != RobotState.EXECUTING:
                if completion_event is not None:
                    completion_event.set()
                return event

            send_goal_future = self._pnp_client.send_goal_async(
                goal, feedback_callback=on_feedback
            )

        def on_goal_response(future: Any) -> None:
            try:
                goal_handle = future.result()
            except Exception as err:
                self.get_logger().error(f"Error obtaining PickAndPlace goal handle: {err}")
                with self._lock:
                    if self._robot_state == RobotState.EXECUTING:
                        self._robot_state = RobotState.FAULT
                self._publish_error("GOAL_ERROR", str(err))
                self.publish_telemetry()
                if completion_event is not None:
                    completion_event.set()
                return

            if not goal_handle or not goal_handle.accepted:
                self.get_logger().error("PickAndPlace goal rejected by server")
                with self._lock:
                    if self._robot_state == RobotState.EXECUTING:
                        self._robot_state = RobotState.FAULT
                self._publish_error("GOAL_REJECTED", "PickAndPlace goal was rejected by action server")
                self.publish_telemetry()
                if completion_event is not None:
                    completion_event.set()
                return

            with self._lock:
                if self._robot_state == RobotState.EXECUTING:
                    self._active_pnp_handle = goal_handle
                else:
                    goal_handle.cancel_goal_async()
                    if completion_event is not None:
                        completion_event.set()
                    return

            res_future = goal_handle.get_result_async()

            def on_result(r_future: Any) -> None:
                should_publish_completion = False
                with self._lock:
                    if self._active_pnp_handle is not goal_handle:
                        # Stale result (superseded by STANDBY teardown or ESTOP); ignore.
                        pass
                    else:
                        self._active_pnp_handle = None
                        if self._robot_state == RobotState.EXECUTING:
                            try:
                                pnp_res = r_future.result()
                                if pnp_res.result.success:
                                    self._robot_state = RobotState.IDLE
                                    self._is_grasped = False
                                    should_publish_completion = True
                                else:
                                    self.get_logger().error(
                                        f"PickAndPlace failed: {pnp_res.result.message}"
                                    )
                                    self._robot_state = RobotState.FAULT
                                    self._publish_error("ACTION_FAILED", pnp_res.result.message)
                                    should_publish_completion = True
                            except Exception as err:
                                self.get_logger().error(f"Error reading PickAndPlace result: {err}")
                                self._robot_state = RobotState.FAULT
                                self._publish_error("RESULT_ERROR", str(err))
                                should_publish_completion = True

                if completion_event is not None:
                    completion_event.set()

                if should_publish_completion:
                    self.publish_telemetry(command_id=command_id)

            res_future.add_done_callback(on_result)

        send_goal_future.add_done_callback(on_goal_response)
        return event

    def handle_emergency_stop(self, command_id: Optional[str] = None) -> RobotTelemetryEvent:
        """Cancels active trajectory and PickAndPlace action immediately and transitions to FAULT state."""
        self.get_logger().warn(f"EMERGENCY STOP TRIGGERED (cmd={command_id})")

        with self._lock:
            self._robot_state = RobotState.FAULT
            active_handle = self._active_traj_handle
            self._active_traj_handle = None
            active_pnp = self._active_pnp_handle
            self._active_pnp_handle = None

        if active_handle is not None:
            try:
                active_handle.cancel_goal_async()
            except Exception as e:
                self.get_logger().warning(f"Failed to cancel active trajectory: {e}")

        if active_pnp is not None:
            try:
                active_pnp.cancel_goal_async()
            except Exception as e:
                self.get_logger().warning(f"Failed to cancel active PickAndPlace: {e}")

        return self.publish_telemetry(command_id=command_id)

    def handle_reset_fault(self, command_id: Optional[str] = None) -> RobotTelemetryEvent:
        """Clears FAULT state and returns to IDLE."""
        self.get_logger().info(f"RESET FAULT TRIGGERED (cmd={command_id})")
        with self._lock:
            if self._robot_state == RobotState.FAULT:
                self._robot_state = RobotState.IDLE

        return self.publish_telemetry(command_id=command_id)

    def _publish_error(self, error_code: str, message: str) -> None:
        """Publishes structured ErrorFrame over Zenoh on schema or state validation failures."""
        err = ErrorFrame(
            error_code=error_code,
            message=message,
            timestamp_ns=time.time_ns(),
        )
        self.get_logger().warning(f"ErrorFrame: [{error_code}] {message}")
        if self._zenoh_pub is not None:
            try:
                self._zenoh_pub.put(err.model_dump_json())
            except Exception as e:
                self.get_logger().error(f"Failed to publish ErrorFrame to Zenoh: {e}")

    def publish_telemetry(self, command_id: Optional[str] = None) -> RobotTelemetryEvent:
        """Emits RobotTelemetryEvent over Zenoh on robot/{id}/telemetry."""
        with self._lock:
            state = self._robot_state
            joints = list(self._current_joints)
            is_grasped = self._is_grasped

        event = RobotTelemetryEvent(
            timestamp_ns=time.time_ns(),
            robot_state=state,
            joint_positions=joints,
            palm_state=PalmState(is_grasped=is_grasped),
            command_id=command_id,
        )

        if self._zenoh_pub is not None:
            try:
                self._zenoh_pub.put(event.model_dump_json(exclude_none=True))
            except Exception as e:
                self.get_logger().error(f"Failed to publish telemetry to Zenoh: {e}")

        return event

    def close(self) -> None:
        """Cleans up active goals, Zenoh subscriptions, and ROS2 resources."""
        with self._lock:
            if self._active_traj_handle is not None:
                try:
                    self._active_traj_handle.cancel_goal_async()
                except Exception:
                    pass
                self._active_traj_handle = None

            if self._active_pnp_handle is not None:
                try:
                    self._active_pnp_handle.cancel_goal_async()
                except Exception:
                    pass
                self._active_pnp_handle = None

        if self._startup_thread is not None and self._startup_thread.is_alive():
            self._startup_thread.join(timeout=1.0)

        if self._zenoh_sub is not None:
            try:
                self._zenoh_sub.undeclare()
            except Exception:
                pass
            self._zenoh_sub = None

        if self._zenoh_pub is not None:
            try:
                self._zenoh_pub.undeclare()
            except Exception:
                pass
            self._zenoh_pub = None

        if self._zenoh_feedback_pub is not None:
            try:
                self._zenoh_feedback_pub.undeclare()
            except Exception:
                pass
            self._zenoh_feedback_pub = None

        if self._owns_zenoh_session and self._zenoh_session is not None:
            try:
                self._zenoh_session.close()
            except Exception:
                pass
            self._zenoh_session = None

        if self._joint_sub is not None:
            try:
                self.destroy_subscription(self._joint_sub)
            except Exception:
                pass
            self._joint_sub = None

        if self._traj_client is not None:
            try:
                self._traj_client.destroy()
            except Exception:
                pass
            self._traj_client = None

        if self._pnp_client is not None:
            try:
                self._pnp_client.destroy()
            except Exception:
                pass
            self._pnp_client = None

        if self._spawn_object_client is not None:
            try:
                self.destroy_client(self._spawn_object_client)
            except Exception:
                pass
            self._spawn_object_client = None

        if self._clear_workspace_client is not None:
            try:
                self.destroy_client(self._clear_workspace_client)
            except Exception:
                pass
            self._clear_workspace_client = None

        if self._switch_client is not None:
            try:
                self.destroy_client(self._switch_client)
            except Exception:
                pass
            self._switch_client = None



def main(args: list[str] | None = None) -> None:
    """Entry point for standalone edge_bridge_node."""
    rclpy.init(args=args)
    node = EdgeBridgeNode()
    executor = MultiThreadedExecutor()
    executor.add_node(node)

    try:
        executor.spin()
    except (KeyboardInterrupt, ExternalShutdownException):
        pass
    finally:
        node.close()
        node.destroy_node()
        if rclpy.ok():
            rclpy.shutdown()


if __name__ == "__main__":
    main()
