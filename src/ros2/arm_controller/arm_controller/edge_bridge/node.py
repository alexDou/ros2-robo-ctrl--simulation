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
from std_msgs.msg import String
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
    WorkcellState,
    robot_command_topic,
    robot_telemetry_topic,
)
from robot_control_interfaces.action import PickAndPlace
from robot_control_interfaces.srv import ClearWorkspace, CommitDrop, MarkGrasped, SpawnObject



from arm_controller.edge_bridge.commands import EdgeBridgeCommandsMixin
from arm_controller.edge_bridge.trajectory import EdgeBridgeTrajectoryMixin
from arm_controller.edge_bridge.actions import EdgeBridgeActionsMixin
from arm_controller.edge_bridge.telemetry import EdgeBridgeTelemetryMixin


from arm_controller.edge_bridge.lifecycle import EdgeBridgeLifecycleMixin
from arm_controller.edge_bridge.commands import EdgeBridgeCommandsMixin
from arm_controller.edge_bridge.trajectory import EdgeBridgeTrajectoryMixin
from arm_controller.edge_bridge.actions import EdgeBridgeActionsMixin
from arm_controller.edge_bridge.telemetry import EdgeBridgeTelemetryMixin


class EdgeBridgeNode(
    EdgeBridgeLifecycleMixin,
    EdgeBridgeCommandsMixin,
    EdgeBridgeTrajectoryMixin,
    EdgeBridgeActionsMixin,
    EdgeBridgeTelemetryMixin,
    Node,
):
    """ROS2 node bridging Zenoh DataFabric commands to ROS2 controllers."""

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
        self.declare_parameter("workcell_state_topic", "workcell/state")
        self.declare_parameter(
            "mark_grasped_service_name",
            "/workcell/mark_grasped",
        )
        self.declare_parameter(
            "commit_drop_service_name",
            "/workcell/commit_drop",
        )
        self.declare_parameter("switch_service_name", "/controller_manager/switch_controller")
        self.declare_parameter("switch_timeout", 5.0)
        self.declare_parameter("standby_park_timeout", 10.0)
        self.declare_parameter("telemetry_rate", 10.0)

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
        self._workcell_state_topic = str(self.get_parameter("workcell_state_topic").value)
        self._mark_grasped_service_name = str(
            self.get_parameter("mark_grasped_service_name").value
        )
        self._commit_drop_service_name = str(
            self.get_parameter("commit_drop_service_name").value
        )

        self._lock = threading.RLock()
        self._cb_group = ReentrantCallbackGroup()
        self._telem_cb_group = MutuallyExclusiveCallbackGroup()

        # State initialization: STANDBY until ENGAGE handshake from Gateway.
        # IDLE means engaged-ready; motion cmds rejected while STANDBY.
        self._robot_state: RobotState = RobotState.STANDBY
        self._is_grasped: bool = False
        self._current_phase: Optional[str] = None
        self._workcell_state: WorkcellState = WorkcellState(spawned=[], in_progress=[], processed=[])
        self._current_joints: list[float] = list(CANONICAL_POSES[PoseName.HOME])
        self._active_traj_handle: Optional[Any] = None
        self._active_pnp_handle: Optional[Any] = None
        self._homing_done_event = threading.Event()
        self._startup_motion_event = threading.Event()
        self._pending_spawn_coords: Optional[tuple[float, float, float]] = None
        self._pending_spawn_command_id: Optional[str] = None
        self._grasp_notified = False
        self._commit_notified = False

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

        self._mark_grasped_client = self.create_client(
            MarkGrasped,
            self._mark_grasped_service_name,
            callback_group=self._cb_group,
        )

        self._commit_drop_client = self.create_client(
            CommitDrop,
            self._commit_drop_service_name,
            callback_group=self._cb_group,
        )

        self._workcell_state_sub = self.create_subscription(
            String,
            self._workcell_state_topic,
            self._on_workcell_state,
            10,
            callback_group=self._telem_cb_group,
        )

        # Unit 6.7.6: single-owner steady stream. Same writer (edge), same
        # topic. 10 Hz cached snapshot while engaged; quiet while STANDBY
        # (parked idle). Gateway stays verbatim forwarder.
        self._telemetry_rate = max(1.0, float(self.get_parameter("telemetry_rate").value))
        self._telemetry_timer = self.create_timer(
            1.0 / self._telemetry_rate,
            self._on_telemetry_timer,
            callback_group=self._telem_cb_group,
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

    @property
    def current_phase(self) -> Optional[str]:
        with self._lock:
            return self._current_phase


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
