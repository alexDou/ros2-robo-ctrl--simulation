"""EdgeNode ROS2 node and Zenoh DataFabric command ingestion service."""

import logging
import threading
import time
from typing import Any, Optional
from pydantic import ValidationError

from domain import (
    CANONICAL_POSES,
    DEFAULT_ROBOT_ID,
    ClearWorkspacePayload,
    CommandType,
    ErrorFrame,
    PalmAction,
    PalmActuatePayload,
    PalmState,
    PoseName,
    RobotCommand,
    RobotState,
    RobotTelemetryEvent,
    SpawnObjectPayload,
    TrajectoryExecutePayload,
    robot_command_topic,
    robot_telemetry_topic,
)

from edge_node.mapper import JointStateMapper
from edge_node.workcell import WorkcellOccupiedError, WorkcellState

logger = logging.getLogger(__name__)


class EdgeNode:
    """EdgeNode combining ROS2 node capabilities with Eclipse Zenoh DataFabric pub/sub."""

    def __init__(
        self,
        robot_id: str = DEFAULT_ROBOT_ID,
        ros2_node: Optional[Any] = None,
        zenoh_session: Optional[Any] = None,
        auto_connect: bool = True,
        joint_states_topic: str = "/joint_states",
    ) -> None:
        self.robot_id = robot_id
        self.command_topic = robot_command_topic(robot_id)
        self.telemetry_topic = robot_telemetry_topic(robot_id)
        self.joint_states_topic = joint_states_topic
        self.mapper = JointStateMapper()
        self.robot_state = RobotState.BOOTING
        self.palm_state = PalmState(is_grasped=False)
        self.workcell_state = WorkcellState()
        self._abort_event = threading.Event()
        self.active_motion_thread: Optional[threading.Thread] = None

        # ROS2 Node setup
        self._owns_ros_node = False
        if ros2_node is not None:
            self.ros2_node = ros2_node
        else:
            import rclpy
            from rclpy.node import Node

            if not rclpy.ok():
                rclpy.init()
            node_name = f"edge_node_{robot_id.replace('-', '_')}"
            self.ros2_node = Node(node_name)
            self._owns_ros_node = True

        # Logger proxy prioritizing ROS2 node logger
        if hasattr(self.ros2_node, "get_logger"):
            self.logger = self.ros2_node.get_logger()
        else:
            self.logger = logger

        # ROS2 subscriptions and timers
        self._joint_sub = None
        self._telemetry_timer = None
        if hasattr(self.ros2_node, "create_subscription"):
            try:
                from sensor_msgs.msg import JointState
                try:
                    from rclpy.qos import qos_profile_sensor_data
                    qos: Any = qos_profile_sensor_data
                except Exception:
                    qos = 10

                self._joint_sub = self.ros2_node.create_subscription(
                    JointState,
                    self.joint_states_topic,
                    self.on_joint_state,
                    qos,
                )
            except Exception as e:
                self.logger.warning(f"Could not subscribe to {self.joint_states_topic}: {e}")

        if hasattr(self.ros2_node, "create_timer"):
            try:
                self._telemetry_timer = self.ros2_node.create_timer(
                    1.0 / 30.0,
                    self.publish_telemetry_tick,
                )
            except Exception as e:
                self.logger.warning(f"Could not create telemetry timer: {e}")

        # Zenoh setup
        self.zenoh_session = zenoh_session
        self._owns_zenoh_session = False
        self._zenoh_sub = None
        self._zenoh_pub = None

        if auto_connect:
            self._init_zenoh()

        # Lifecycle state initialized
        self.robot_state = RobotState.IDLE

    def _init_zenoh(self) -> None:
        if self.zenoh_session is None:
            import zenoh

            self.zenoh_session = zenoh.open(zenoh.Config())
            self._owns_zenoh_session = True

        self._zenoh_pub = self.zenoh_session.declare_publisher(self.telemetry_topic)
        self._zenoh_sub = self.zenoh_session.declare_subscriber(
            self.command_topic,
            self._on_zenoh_sample,
        )
        self.logger.info(
            f"EdgeNode listening on {self.command_topic}, streaming to {self.telemetry_topic}"
        )

    def _on_zenoh_sample(self, sample: Any) -> None:
        try:
            raw_bytes = bytes(sample.payload)
            payload_str = raw_bytes.decode("utf-8")
        except Exception as e:
            self.logger.error(f"Failed to decode Zenoh sample on {self.command_topic}: {e}")
            return

        self.handle_command_payload(payload_str)

    def on_joint_state(self, msg: Any) -> list[float]:
        """Ingests a JointState ROS2 message and updates canonical joint positions.

        Args:
            msg: Inbound message (sensor_msgs.msg.JointState or dict with .name and .position).
        """
        return self.mapper.update_from_joint_state(msg)

    def _create_telemetry_event(self, command_id: Optional[str] = None) -> RobotTelemetryEvent:
        now_ns = time.time_ns()
        if hasattr(self.ros2_node, "get_clock"):
            try:
                now_ns = self.ros2_node.get_clock().now().nanoseconds
            except Exception:
                pass

        return RobotTelemetryEvent(
            timestamp_ns=now_ns,
            robot_state=self.robot_state,
            joint_positions=self.mapper.get_positions(),
            palm_state=self.palm_state,
            inference_metrics=None,
            command_id=command_id,
        )

    def publish_telemetry_tick(self) -> RobotTelemetryEvent:
        """Emits a periodic 30 Hz RobotTelemetryEvent with current joint positions."""
        event = self._create_telemetry_event(command_id=None)
        self._publish_telemetry(event)
        return event

    def _execute_palm_actuation(
        self, action: PalmAction, command_id: Optional[str] = None
    ) -> Optional[RobotTelemetryEvent]:
        self.robot_state = RobotState.PROCESSING
        # 200ms simulated pneumatic delay, immediately preemptible by abort event
        if self._abort_event.wait(0.2) or self._abort_event.is_set():
            return None

        if self.robot_state == RobotState.FAULT:
            return None

        self.palm_state.is_grasped = (action == PalmAction.GRASP)
        self.robot_state = RobotState.IDLE
        event = self._create_telemetry_event(command_id=command_id)
        self._publish_telemetry(event)
        return event

    def _execute_trajectory(
        self,
        target_positions: list[float],
        command_id: Optional[str] = None,
        duration: float = 2.0,
        planning_delay: float = 0.05,
    ) -> Optional[RobotTelemetryEvent]:
        self.robot_state = RobotState.PROCESSING
        if planning_delay > 0:
            if self._abort_event.wait(planning_delay):
                return None

        if self._abort_event.is_set() or self.robot_state == RobotState.FAULT:
            return None

        self.robot_state = RobotState.EXECUTING
        start_positions = list(self.mapper.get_positions())
        rate_hz = 30.0
        dt = 1.0 / rate_hz
        total_steps = 1 if duration <= 0 else max(1, int(round(duration * rate_hz)))

        for step in range(1, total_steps + 1):
            if self._abort_event.is_set():
                break
            u = min(1.0, step / total_steps)
            # Cubic smooth-step interpolation: s(u) = 3u^2 - 2u^3
            s = 3.0 * (u ** 2) - 2.0 * (u ** 3)
            current = [
                start_positions[i] + s * (target_positions[i] - start_positions[i])
                for i in range(6)
            ]
            self.mapper.set_positions(current)
            if duration > 0:
                if self._abort_event.wait(dt):
                    break

        if self._abort_event.is_set() or self.robot_state == RobotState.FAULT:
            return None

        self.mapper.set_positions(target_positions)
        self.robot_state = RobotState.IDLE

        event = self._create_telemetry_event(command_id=command_id)
        self._publish_telemetry(event)
        return event

    def handle_command_payload(
        self, payload: str | bytes, synchronous: bool = False
    ) -> Optional[RobotTelemetryEvent | ErrorFrame]:
        """Ingests, validates, and processes an inbound RobotCommand payload string or bytes."""
        if isinstance(payload, bytes):
            try:
                payload = payload.decode("utf-8")
            except UnicodeDecodeError as e:
                self.logger.error(f"Invalid UTF-8 payload on {self.command_topic}: {e}")
                return None

        try:
            command = RobotCommand.model_validate_json(payload)
        except (ValidationError, ValueError) as err:
            self.logger.error(f"Malformed RobotCommand payload on {self.command_topic}: {err}")
            return None

        now_ns = time.time_ns()
        if hasattr(self.ros2_node, "get_clock"):
            try:
                now_ns = self.ros2_node.get_clock().now().nanoseconds
            except Exception:
                pass

        if command.type == CommandType.PING:
            self.logger.info(
                f"Received PING command '{command.command_id}' from '{command.sender_id}'"
            )
            event = self._create_telemetry_event(command_id=command.command_id)
            self._publish_telemetry(event)
            return event

        if command.type == CommandType.EMERGENCY_STOP:
            self.logger.warning(
                f"EMERGENCY_STOP received '{command.command_id}' from '{command.sender_id}'"
            )
            self._abort_event.set()
            self.robot_state = RobotState.FAULT
            event = self._create_telemetry_event(command_id=command.command_id)
            self._publish_telemetry(event)
            return event

        if command.type == CommandType.RESET_FAULT:
            self.logger.info(
                f"RESET_FAULT received '{command.command_id}' from '{command.sender_id}'"
            )
            if self.robot_state == RobotState.FAULT:
                if self.active_motion_thread and self.active_motion_thread.is_alive():
                    self.active_motion_thread.join(timeout=0.2)
                self._abort_event.clear()
                self.robot_state = RobotState.IDLE
            event = self._create_telemetry_event(command_id=command.command_id)
            self._publish_telemetry(event)
            return event

        # SingleCommandGating: only admit operational/workcell commands when IDLE
        if self.robot_state != RobotState.IDLE:
            err_frame = ErrorFrame(
                error_code="ROBOT_BUSY",
                message=f"Robot is currently {self.robot_state.value}; rejecting command {command.command_id}",
                timestamp_ns=now_ns,
            )
            self.logger.warning(
                f"Command {command.command_id} ({command.type.value}) rejected: robot is {self.robot_state.value}"
            )
            self._publish_error(err_frame)
            return err_frame

        if command.type == CommandType.PALM_ACTUATE:
            try:
                palm_payload = PalmActuatePayload.model_validate(command.payload)
            except ValidationError as err:
                self.logger.error(f"Invalid PalmActuatePayload: {err}")
                return None
            self._abort_event.clear()
            if synchronous:
                return self._execute_palm_actuation(palm_payload.action, command.command_id)
            else:
                self.robot_state = RobotState.PROCESSING
                t = threading.Thread(
                    target=self._execute_palm_actuation,
                    args=(palm_payload.action, command.command_id),
                    daemon=True,
                )
                self.active_motion_thread = t
                t.start()
                return None

        if command.type == CommandType.TRAJECTORY_EXECUTE:
            try:
                traj_payload = TrajectoryExecutePayload.model_validate(command.payload)
            except ValidationError as err:
                self.logger.error(f"Invalid TrajectoryExecutePayload: {err}")
                return None

            target: Optional[list[float]] = None
            if traj_payload.pose_name is not None:
                target = CANONICAL_POSES.get(traj_payload.pose_name)
            elif traj_payload.waypoints:
                target = traj_payload.waypoints[-1]

            if target is None:
                self.logger.error(f"Invalid trajectory target in command {command.command_id}")
                err_frame = ErrorFrame(
                    error_code="INVALID_COMMAND_PAYLOAD",
                    message="Trajectory command requires pose_name or waypoints",
                    timestamp_ns=now_ns,
                )
                self._publish_error(err_frame)
                return err_frame

            self._abort_event.clear()
            if synchronous:
                return self._execute_trajectory(
                    target,
                    command_id=command.command_id,
                    duration=0.0,
                    planning_delay=0.0,
                )
            else:
                self.robot_state = RobotState.PROCESSING
                t = threading.Thread(
                    target=self._execute_trajectory,
                    args=(target, command.command_id, 2.0, 0.05),
                    daemon=True,
                )
                self.active_motion_thread = t
                t.start()
                return None

        if command.type == CommandType.SPAWN_OBJECT:
            try:
                spawn_payload = SpawnObjectPayload.model_validate(command.payload)
            except ValidationError as err:
                self.logger.error(
                    f"Invalid SpawnObjectPayload in command {command.command_id}: {err}"
                )
                err_frame = ErrorFrame(
                    error_code="INVALID_COMMAND_PAYLOAD",
                    message=f"Invalid SpawnObjectPayload: {err}",
                    timestamp_ns=now_ns,
                )
                self._publish_error(err_frame)
                return err_frame

            try:
                self.workcell_state.spawn_gear(spawn_payload)
            except WorkcellOccupiedError:
                err_frame = ErrorFrame(
                    error_code="WORKCELL_OCCUPIED",
                    message=f"Active gear already present in workcell; rejecting spawn command {command.command_id}",
                    timestamp_ns=now_ns,
                )
                self.logger.warning(
                    f"Command {command.command_id} (SPAWN_OBJECT) rejected: active gear already present"
                )
                self._publish_error(err_frame)
                return err_frame
            except ValueError as val_err:
                err_frame = ErrorFrame(
                    error_code="INVALID_COMMAND_PAYLOAD",
                    message=f"Invalid coordinate values: {val_err}",
                    timestamp_ns=now_ns,
                )
                self.logger.warning(
                    f"Command {command.command_id} (SPAWN_OBJECT) rejected: {val_err}"
                )
                self._publish_error(err_frame)
                return err_frame

            self.logger.info(
                f"Spawned {spawn_payload.object_type.value} at ({spawn_payload.x:.3f}, {spawn_payload.y:.3f}, {spawn_payload.z:.3f}) for command '{command.command_id}'"
            )
            event = self._create_telemetry_event(command_id=command.command_id)
            self._publish_telemetry(event)
            return event

        if command.type == CommandType.CLEAR_WORKSPACE:
            try:
                ClearWorkspacePayload.model_validate(command.payload)
            except ValidationError as err:
                self.logger.error(
                    f"Invalid ClearWorkspacePayload in command {command.command_id}: {err}"
                )
                err_frame = ErrorFrame(
                    error_code="INVALID_COMMAND_PAYLOAD",
                    message=f"Invalid ClearWorkspacePayload: {err}",
                    timestamp_ns=now_ns,
                )
                self._publish_error(err_frame)
                return err_frame

            self.workcell_state.clear()
            self.logger.info(
                f"Workspace cleared for command '{command.command_id}'"
            )
            event = self._create_telemetry_event(command_id=command.command_id)
            self._publish_telemetry(event)
            return event

        self.logger.info(
            f"Received {command.type.value} command '{command.command_id}' from '{command.sender_id}'"
        )
        return None

    def _publish_telemetry(self, event: RobotTelemetryEvent) -> None:
        if self._zenoh_pub is not None:
            self._zenoh_pub.put(event.model_dump_json(exclude_none=True))
            self.logger.debug(
                f"Emitted RobotTelemetryEvent to {self.telemetry_topic} (state={event.robot_state.value})"
            )

    def _publish_error(self, err_frame: ErrorFrame) -> None:
        if self._zenoh_pub is not None:
            self._zenoh_pub.put(err_frame.model_dump_json())
            self.logger.warning(
                f"Emitted ErrorFrame to {self.telemetry_topic}: {err_frame.error_code} - {err_frame.message}"
            )

    def close(self) -> None:
        """Cleans up Zenoh subscriptions/sessions and ROS2 nodes."""
        if self._telemetry_timer is not None:
            try:
                self._telemetry_timer.cancel()
            except Exception:
                pass
            self._telemetry_timer = None

        if self._joint_sub is not None:
            try:
                if hasattr(self.ros2_node, "destroy_subscription"):
                    self.ros2_node.destroy_subscription(self._joint_sub)
            except Exception:
                pass
            self._joint_sub = None

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

        if self._owns_zenoh_session and self.zenoh_session is not None:
            try:
                self.zenoh_session.close()
            except Exception:
                pass
            self.zenoh_session = None

        if self._owns_ros_node and self.ros2_node is not None:
            try:
                self.ros2_node.destroy_node()
            except Exception:
                pass
            self.ros2_node = None
