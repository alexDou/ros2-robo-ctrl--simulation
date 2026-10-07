"""ROS2 entry point hosting the virtual_plc Modbus TCP server (SIM only)."""

import json

import rclpy
from rclpy.node import Node
from std_msgs.msg import String

from cell_devices.belt_tracking import placement_seq
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
        # SIM physics only (D35): a Gearwheel the arm grasped is no longer on the belt. A real
        # belt needs no message for that, so this never touches the register map.
        self.create_subscription(String, "workcell/state", self._on_workcell_state, 10)

    def _on_workcell_state(self, msg: String) -> None:
        try:
            snapshot = json.loads(msg.data)
            taken = [*snapshot.get("in_progress", []), *snapshot.get("processed", [])]
            ids = [str(entry["id"]) for entry in taken]
        except (ValueError, KeyError, TypeError, AttributeError):
            self.get_logger().warning("Ignoring malformed workcell/state", throttle_duration_sec=5)
            return
        for gear_id in ids:
            seq = placement_seq(gear_id)
            if seq is not None:
                self._plc.remove_belt_item(seq)

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
