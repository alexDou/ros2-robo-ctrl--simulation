"""Standalone synthetic ROS2 JointState publisher at 30 Hz."""

import os
import sys
import time
from typing import Optional
import rclpy
from rclpy.node import Node
from sensor_msgs.msg import JointState

from domain import CANONICAL_UR5E_JOINTS


class MockJointStatePublisher(Node):
    """ROS2 node publishing synthetic zero-state JointState messages at 30 Hz."""

    def __init__(
        self,
        topic: str = "/joint_states",
        rate_hz: float = 30.0,
        node_name: str = "mock_joint_state_publisher",
    ) -> None:
        super().__init__(node_name)
        try:
            from rclpy.qos import qos_profile_sensor_data
            qos: Any = qos_profile_sensor_data
        except Exception:
            qos = 10
        self.publisher_ = self.create_publisher(JointState, topic, qos)
        self.period = 1.0 / rate_hz
        self.timer = self.create_timer(self.period, self.publish_joint_state)
        self.joint_names = list(CANONICAL_UR5E_JOINTS)
        self.get_logger().info(
            f"MockJointStatePublisher started, publishing to {topic} at {rate_hz} Hz"
        )

    def create_joint_state_msg(self) -> JointState:
        """Creates a synthetic zero-state JointState message with canonical joint names."""
        msg = JointState()
        now = self.get_clock().now().to_msg()
        msg.header.stamp = now
        msg.header.frame_id = "base_link"
        msg.name = list(self.joint_names)
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
    topic = os.environ.get("JOINT_STATES_TOPIC", "/joint_states")
    rate_hz = float(os.environ.get("PUBLISH_RATE_HZ", "30.0"))

    rclpy.init(args=args)
    publisher_node = MockJointStatePublisher(topic=topic, rate_hz=rate_hz)
    try:
        rclpy.spin(publisher_node)
    except (KeyboardInterrupt, Exception):
        pass
    finally:
        publisher_node.destroy_node()
        if rclpy.ok():
            rclpy.shutdown()


if __name__ == "__main__":
    main(sys.argv)
