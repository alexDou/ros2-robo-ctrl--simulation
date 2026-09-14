"""Standalone continuous 30 Hz sinusoidal mock motion publisher for UR5e.

Generates smooth, deterministic multi-axis sinusoidal sweeps across all 6 canonical
UR5e revolute joints and emits both ROS2 sensor_msgs/msg/JointState and
Zenoh DataFabric RobotTelemetryEvent frames.
"""

import argparse
from dataclasses import dataclass
import logging
import math
import os
from pathlib import Path
import sys
import time
from typing import Any, Optional

# Ensure src root is in sys.path for direct script execution
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from domain import (
    CANONICAL_UR5E_JOINTS,
    DEFAULT_ROBOT_ID,
    RobotState,
    RobotTelemetryEvent,
    robot_telemetry_topic,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class JointSinusoidConfig:
    """Configuration for a single joint's continuous sinusoidal oscillation."""

    name: str
    frequency_hz: float
    amplitude: float
    phase_offset: float
    center_offset: float = 0.0
    min_limit: float = -math.pi
    max_limit: float = math.pi


# Prime-based, non-harmonic frequencies producing rich, organic 3D spatial coverage
DEFAULT_UR5E_MOTION_CONFIGS: tuple[JointSinusoidConfig, ...] = (
    JointSinusoidConfig(
        name="shoulder_pan_joint",
        frequency_hz=0.11,
        amplitude=1.20,
        phase_offset=0.0,
        center_offset=0.0,
    ),
    JointSinusoidConfig(
        name="shoulder_lift_joint",
        frequency_hz=0.17,
        amplitude=0.70,
        phase_offset=math.pi / 4.0,
        center_offset=-1.5708,  # Rest upright pose ~ -pi/2
    ),
    JointSinusoidConfig(
        name="elbow_joint",
        frequency_hz=0.23,
        amplitude=0.90,
        phase_offset=math.pi / 2.0,
        center_offset=1.5708,  # Forward reach elbow angle ~ +pi/2
    ),
    JointSinusoidConfig(
        name="wrist_1_joint",
        frequency_hz=0.29,
        amplitude=0.85,
        phase_offset=3.0 * math.pi / 4.0,
        center_offset=-1.5708,
    ),
    JointSinusoidConfig(
        name="wrist_2_joint",
        frequency_hz=0.37,
        amplitude=1.10,
        phase_offset=math.pi / 3.0,
        center_offset=0.0,
    ),
    JointSinusoidConfig(
        name="wrist_3_joint",
        frequency_hz=0.43,
        amplitude=1.35,
        phase_offset=math.pi / 6.0,
        center_offset=0.0,
    ),
)


class MockMotionPublisher:
    """Generates continuous 30 Hz sinusoidal trajectories across UR5e joints."""

    def __init__(
        self,
        robot_id: str = DEFAULT_ROBOT_ID,
        topic: str = "/joint_states",
        rate_hz: float = 30.0,
        node_name: str = "mock_motion_publisher",
        joint_configs: tuple[JointSinusoidConfig, ...] = DEFAULT_UR5E_MOTION_CONFIGS,
        ros2_node: Optional[Any] = None,
        zenoh_session: Optional[Any] = None,
        enable_zenoh: bool = False,
    ) -> None:
        self.robot_id = robot_id
        self.topic = topic
        self.rate_hz = rate_hz
        self.period = 1.0 / rate_hz
        self.joint_configs = joint_configs
        self.enable_zenoh = enable_zenoh
        self.telemetry_topic = robot_telemetry_topic(robot_id)

        self._start_time = time.monotonic()
        self._current_positions: list[float] = [cfg.center_offset for cfg in self.joint_configs]
        self._joint_names: list[str] = [cfg.name for cfg in self.joint_configs]
        self._zero_effort: list[float] = [0.0] * len(self.joint_configs)

        # ROS2 Node setup
        self._owns_ros_node = False
        if ros2_node is not None:
            self.ros2_node = ros2_node
        else:
            import rclpy
            from rclpy.node import Node

            if not rclpy.ok():
                rclpy.init()
            self.ros2_node = Node(node_name)
            self._owns_ros_node = True

        if hasattr(self.ros2_node, "get_logger"):
            self.logger = self.ros2_node.get_logger()
        else:
            self.logger = logger

        # ROS2 Publisher
        self.ros_publisher = None
        if hasattr(self.ros2_node, "create_publisher"):
            try:
                from sensor_msgs.msg import JointState
                try:
                    from rclpy.qos import qos_profile_sensor_data
                    qos: Any = qos_profile_sensor_data
                except Exception:
                    qos = 10
                self.ros_publisher = self.ros2_node.create_publisher(JointState, self.topic, qos)
            except Exception as e:
                self.logger.warning(f"Failed to create ROS2 publisher on {self.topic}: {e}")

        # Timer setup
        self._timer = None
        if hasattr(self.ros2_node, "create_timer"):
            try:
                self._timer = self.ros2_node.create_timer(self.period, self.publish_tick)
            except Exception as e:
                self.logger.warning(f"Failed to create ROS2 timer: {e}")

        # Zenoh setup
        self.zenoh_session = zenoh_session
        self._owns_zenoh_session = False
        self._zenoh_pub = None
        if self.enable_zenoh:
            self._init_zenoh()

        self.logger.info(
            f"MockMotionPublisher initialized for {robot_id} at {rate_hz} Hz on {topic}"
        )

    def _init_zenoh(self) -> None:
        try:
            if self.zenoh_session is None:
                import zenoh

                self.zenoh_session = zenoh.open(zenoh.Config())
                self._owns_zenoh_session = True
            self._zenoh_pub = self.zenoh_session.declare_publisher(self.telemetry_topic)
            self.logger.info(f"Zenoh publisher declared on {self.telemetry_topic}")
        except Exception as e:
            self.logger.warning(f"Could not initialize Zenoh DataFabric session: {e}")

    def calculate_joint_positions(self, t: float) -> list[float]:
        """Calculates deterministic joint angles clamped to physical limits [-pi, pi]."""
        positions: list[float] = []
        for cfg in self.joint_configs:
            angle = cfg.center_offset + cfg.amplitude * math.sin(
                2.0 * math.pi * cfg.frequency_hz * t + cfg.phase_offset
            )
            clamped = max(cfg.min_limit, min(cfg.max_limit, angle))
            positions.append(clamped)
        return positions

    def calculate_joint_velocities(self, t: float) -> list[float]:
        """Calculates instantaneous joint velocities from analytical derivatives."""
        velocities: list[float] = []
        for cfg in self.joint_configs:
            angle = cfg.center_offset + cfg.amplitude * math.sin(
                2.0 * math.pi * cfg.frequency_hz * t + cfg.phase_offset
            )
            # If position is saturated at physical limit, velocity is 0
            if angle < cfg.min_limit or angle > cfg.max_limit:
                velocities.append(0.0)
            else:
                vel = 2.0 * math.pi * cfg.frequency_hz * cfg.amplitude * math.cos(
                    2.0 * math.pi * cfg.frequency_hz * t + cfg.phase_offset
                )
                velocities.append(vel)
        return velocities

    def get_current_positions(self) -> list[float]:
        """Returns the most recent calculated joint positions (zero-order hold)."""
        return list(self._current_positions)

    def _get_timestamp_ns_and_stamp(self) -> tuple[int, Any]:
        """Retrieves clock nanoseconds and ROS2 stamp struct in a single clock snapshot."""
        now_ns = time.time_ns()
        if hasattr(self.ros2_node, "get_clock"):
            try:
                now = self.ros2_node.get_clock().now()
                now_ns = now.nanoseconds
                stamp = now.to_msg()
                return now_ns, stamp
            except Exception:
                pass
        # Fallback ROS2 stamp
        try:
            from builtin_interfaces.msg import Time as RosTime

            stamp = RosTime()
            stamp.sec = now_ns // 1_000_000_000
            stamp.nanosec = now_ns % 1_000_000_000
        except Exception:
            stamp = None
        return now_ns, stamp

    def create_joint_state_msg(
        self,
        t: Optional[float] = None,
        positions: Optional[list[float]] = None,
        velocities: Optional[list[float]] = None,
        stamp: Optional[Any] = None,
    ) -> Any:
        """Constructs a standard sensor_msgs/msg/JointState message."""
        from sensor_msgs.msg import JointState

        if positions is None or velocities is None:
            if t is None:
                t = time.monotonic() - self._start_time
            if positions is None:
                positions = self.calculate_joint_positions(t)
            if velocities is None:
                velocities = self.calculate_joint_velocities(t)

        self._current_positions = positions

        if stamp is None:
            _, stamp = self._get_timestamp_ns_and_stamp()

        msg = JointState()
        if stamp is not None:
            msg.header.stamp = stamp
        msg.header.frame_id = "base_link"
        msg.name = self._joint_names
        msg.position = positions
        msg.velocity = velocities
        msg.effort = self._zero_effort
        return msg

    def create_telemetry_event(
        self,
        t: Optional[float] = None,
        positions: Optional[list[float]] = None,
        timestamp_ns: Optional[int] = None,
    ) -> RobotTelemetryEvent:
        """Constructs a typed RobotTelemetryEvent conforming to the wire contract."""
        if positions is None:
            if t is None:
                t = time.monotonic() - self._start_time
            positions = self.calculate_joint_positions(t)

        self._current_positions = positions

        if timestamp_ns is None:
            timestamp_ns, _ = self._get_timestamp_ns_and_stamp()

        return RobotTelemetryEvent(
            timestamp_ns=timestamp_ns,
            robot_state=RobotState.EXECUTING,
            joint_positions=positions,
            inference_metrics=None,
            command_id=None,
        )

    def publish_tick(self, t: Optional[float] = None) -> tuple[Any, RobotTelemetryEvent]:
        """Publishes one synchronized 30 Hz step to both ROS2 and Zenoh."""
        if t is None:
            t = time.monotonic() - self._start_time

        # Single snapshot evaluation on hot-path
        positions = self.calculate_joint_positions(t)
        velocities = self.calculate_joint_velocities(t)
        now_ns, stamp = self._get_timestamp_ns_and_stamp()

        msg = self.create_joint_state_msg(
            positions=positions, velocities=velocities, stamp=stamp
        )
        event = self.create_telemetry_event(positions=positions, timestamp_ns=now_ns)

        # 1. ROS2 publish
        if self.ros_publisher is not None:
            try:
                self.ros_publisher.publish(msg)
            except Exception as e:
                self.logger.error(f"Failed to publish ROS2 JointState: {e}")

        # 2. Zenoh DataFabric publish
        if self._zenoh_pub is not None:
            try:
                payload = event.model_dump_json()
                self._zenoh_pub.put(payload)
            except Exception as e:
                self.logger.error(f"Failed to emit Zenoh telemetry: {e}")

        return msg, event

    def close(self) -> None:
        """Disposes resources cleanly."""
        if self._timer is not None:
            try:
                self._timer.cancel()
            except Exception:
                pass
            self._timer = None

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


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Continuous 30 Hz Sinusoidal Mock Motion Publisher for UR5e"
    )
    parser.add_argument(
        "--rate",
        type=float,
        default=float(os.environ.get("PUBLISH_RATE_HZ", "30.0")),
        help="Publish rate in Hz (default: 30.0)",
    )
    parser.add_argument(
        "--topic",
        type=str,
        default=os.environ.get("JOINT_STATES_TOPIC", "/joint_states"),
        help="ROS2 JointState topic (default: /joint_states)",
    )
    parser.add_argument(
        "--robot-id",
        type=str,
        default=os.environ.get("ROBOT_ID", DEFAULT_ROBOT_ID),
        help="Robot identifier for Zenoh DataFabric scoping",
    )
    zenoh_group = parser.add_mutually_exclusive_group()
    zenoh_group.add_argument(
        "--zenoh",
        dest="enable_zenoh",
        action="store_true",
        help="Enable direct Zenoh DataFabric publisher (standalone mode)",
    )
    zenoh_group.add_argument(
        "--no-zenoh",
        dest="enable_zenoh",
        action="store_false",
        help="Disable Zenoh DataFabric publisher (default when running alongside EdgeNode)",
    )
    zenoh_group.set_defaults(
        enable_zenoh=os.environ.get("ENABLE_ZENOH", "0") == "1"
    )
    return parser


def main(args: Optional[list[str]] = None) -> None:
    parser = build_arg_parser()
    parsed, ros_args = parser.parse_known_args(args if args is not None else sys.argv[1:])

    import rclpy

    rclpy.init(args=ros_args)
    publisher = MockMotionPublisher(
        robot_id=parsed.robot_id,
        topic=parsed.topic,
        rate_hz=parsed.rate,
        enable_zenoh=parsed.enable_zenoh,
    )

    try:
        rclpy.spin(publisher.ros2_node)
    except (KeyboardInterrupt, Exception):
        pass
    finally:
        publisher.close()
        if rclpy.ok():
            rclpy.shutdown()


if __name__ == "__main__":
    main()
