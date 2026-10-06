"""ROS2 entry point hosting the virtual_plc Modbus TCP server (SIM only)."""

import rclpy
from rclpy.node import Node

from cell_devices.virtual_plc import VirtualPlcServer


class VirtualPlcNode(Node):
    def __init__(self) -> None:
        super().__init__("virtual_plc")
        host = self.declare_parameter("host", "127.0.0.1").value
        port = self.declare_parameter("port", 5020).value
        # Simulated seconds per wall second; >1 only for tests that run whole decks.
        time_scale = float(self.declare_parameter("time_scale", 1.0).value)
        self._plc = VirtualPlcServer(host, port, time_scale=time_scale)
        self._plc.start()
        self.get_logger().info(f"virtual_plc serving Modbus TCP on {host}:{port}")

    def destroy_node(self) -> bool:
        self._plc.stop()
        return super().destroy_node()


def main(args=None) -> None:
    rclpy.init(args=args)
    node = VirtualPlcNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.try_shutdown()
