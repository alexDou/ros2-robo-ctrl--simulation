"""EdgeNode ROS2 node and Zenoh DataFabric command ingestion service."""

import logging
import time
from typing import Any, Optional
from pydantic import ValidationError

from domain import (
    CommandType,
    RobotCommand,
    RobotState,
    RobotTelemetryEvent,
    robot_command_topic,
    robot_telemetry_topic,
)

from edge_node.mapper import JointStateMapper

logger = logging.getLogger(__name__)


class EdgeNode:
    """EdgeNode combining ROS2 node capabilities with Eclipse Zenoh DataFabric pub/sub."""

    def __init__(
        self,
        robot_id: str = "arm-ur5",
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
        self.robot_state = RobotState.IDLE

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
        """Ingests a JointState ROS2 message and updates canonical joint positions."""
        return self.mapper.update_from_joint_state(msg)

    def publish_telemetry_tick(self) -> RobotTelemetryEvent:
        """Emits a periodic 30 Hz RobotTelemetryEvent with current joint positions."""
        now_ns = time.time_ns()
        if hasattr(self.ros2_node, "get_clock"):
            try:
                now_ns = self.ros2_node.get_clock().now().nanoseconds
            except Exception:
                pass

        event = RobotTelemetryEvent(
            timestamp_ns=now_ns,
            robot_state=self.robot_state,
            joint_positions=self.mapper.get_positions(),
            inference_metrics=None,
            command_id=None,
        )
        self._publish_telemetry(event)
        return event

    def handle_command_payload(self, payload: str | bytes) -> Optional[RobotTelemetryEvent]:
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

        if command.type == CommandType.PING:
            self.logger.info(
                f"Received PING command '{command.command_id}' from '{command.sender_id}'"
            )
            now_ns = time.time_ns()
            if hasattr(self.ros2_node, "get_clock"):
                try:
                    now_ns = self.ros2_node.get_clock().now().nanoseconds
                except Exception:
                    pass
            event = RobotTelemetryEvent(
                timestamp_ns=now_ns,
                robot_state=self.robot_state,
                joint_positions=self.mapper.get_positions(),
                inference_metrics=None,
                command_id=command.command_id,
            )
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
