"""Standalone synthetic ROS2 JointState publisher at 30 Hz."""

import argparse
import math
import os
import sys
import time
from pathlib import Path
from typing import Any, Optional

# Ensure src root is in sys.path for direct script execution
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import rclpy
from rclpy.node import Node
from sensor_msgs.msg import JointState

from domain import CANONICAL_UR5E_JOINTS


class MockJointStatePublisher(Node):
    """ROS2 node publishing synthetic JointState messages at 30 Hz."""

    def __init__(
        self,
        topic: str = "/joint_states",
        rate_hz: float = 30.0,
        node_name: str = "mock_joint_state_publisher",
        dynamic: bool = False,
    ) -> None:
        super().__init__(node_name)
        self.dynamic = dynamic
        try:
            from rclpy.qos import qos_profile_sensor_data
            qos: Any = qos_profile_sensor_data
        except Exception:
            qos = 10
        self.publisher_ = self.create_publisher(JointState, topic, qos)
        self.period = 1.0 / rate_hz
        self.timer = self.create_timer(self.period, self.publish_joint_state)
        self.joint_names = list(CANONICAL_UR5E_JOINTS)
        mode = "dynamic sinusoidal" if self.dynamic else "zero-state"
        self.get_logger().info(
            f"MockJointStatePublisher started ({mode}), publishing to {topic} at {rate_hz} Hz"
        )

    def create_joint_state_msg(self) -> JointState:
        """Creates a synthetic JointState message with canonical joint names."""
        msg = JointState()
        now = self.get_clock().now().to_msg()
        msg.header.stamp = now
        msg.header.frame_id = "base_link"
        msg.name = list(self.joint_names)
        if self.dynamic:
            t = time.time()
            msg.position = [float(math.sin(t * 1.5 + i * 0.8)) for i in range(len(self.joint_names))]
            msg.velocity = [float(1.5 * math.cos(t * 1.5 + i * 0.8)) for i in range(len(self.joint_names))]
            msg.effort = [0.0] * len(self.joint_names)
        else:
            msg.position = [0.0] * len(self.joint_names)
            msg.velocity = [0.0] * len(self.joint_names)
            msg.effort = [0.0] * len(self.joint_names)
        return msg

    def publish_joint_state(self) -> JointState:
        """Publishes a single JointState message and returns it."""
        msg = self.create_joint_state_msg()
        self.publisher_.publish(msg)
        return msg


def main(args: Optional[list[str]] = None) -> None:
    parser = argparse.ArgumentParser(description="Standalone synthetic ROS2 JointState publisher")
    parser.add_argument(
        "--rate",
        type=float,
        default=float(os.environ.get("PUBLISH_RATE_HZ", "30.0")),
        help="Publish rate in Hz",
    )
    parser.add_argument(
        "--topic",
        type=str,
        default=os.environ.get("JOINT_STATES_TOPIC", "/joint_states"),
        help="Joint states topic",
    )
    parser.add_argument(
        "--dynamic",
        action="store_true",
        default=os.environ.get("DYNAMIC_JOINTS", "0") == "1",
        help="Publish dynamic sine-wave joint motions instead of zero-state",
    )
    parsed, ros_args = parser.parse_known_args(args if args is not None else sys.argv[1:])

    rclpy.init(args=ros_args)
    publisher_node = MockJointStatePublisher(
        topic=parsed.topic,
        rate_hz=parsed.rate,
        dynamic=parsed.dynamic,
    )
    try:
        rclpy.spin(publisher_node)
    except (KeyboardInterrupt, Exception):
        pass
    finally:
        publisher_node.destroy_node()
        if rclpy.ok():
            rclpy.shutdown()


if __name__ == "__main__":
    main()
