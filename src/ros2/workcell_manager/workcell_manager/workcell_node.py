"""Standalone WorkcellNode and SpindleTower inventory tracker per ADR 0004 and Refactor-A.1."""

import threading
from typing import Optional

import rclpy
from rclpy.executors import ExternalShutdownException
from rclpy.node import Node
from geometry_msgs.msg import Point
from std_msgs.msg import Int32

from robot_control_interfaces.srv import ClearWorkspace, GetDropSlot

DEFAULT_SPINDLE_TOWER_COORDS: tuple[float, float, float] = (0.40, -0.30, 0.0)
GEAR_STACK_HEIGHT_STEP_M: float = 0.02
MAX_TOWER_STACK_CAPACITY: int = 10


class WorkcellNode(Node):
    """ROS2 node managing SpindleTower inventory and table workpiece coordinates."""

    def __init__(self, node_name: str = "workcell_node", **kwargs) -> None:
        super().__init__(node_name, **kwargs)

        self.declare_parameter("tower_x", DEFAULT_SPINDLE_TOWER_COORDS[0])
        self.declare_parameter("tower_y", DEFAULT_SPINDLE_TOWER_COORDS[1])
        self.declare_parameter("tower_z", DEFAULT_SPINDLE_TOWER_COORDS[2])
        self.declare_parameter("height_step", GEAR_STACK_HEIGHT_STEP_M)
        self.declare_parameter("max_capacity", MAX_TOWER_STACK_CAPACITY)

        self._tower_x = float(self.get_parameter("tower_x").value)
        self._tower_y = float(self.get_parameter("tower_y").value)
        self._tower_z = float(self.get_parameter("tower_z").value)
        self._height_step = float(self.get_parameter("height_step").value)
        self._max_capacity = int(self.get_parameter("max_capacity").value)

        self._lock = threading.Lock()
        self._inventory: int = 0
        self._active_workpiece: Optional[tuple[float, float, float]] = None

        # Publisher for inventory count updates
        self._inventory_pub = self.create_publisher(Int32, "workcell/inventory", 10)

        # Service servers for drop slot calculation and workspace clearing
        self._get_drop_slot_srv = self.create_service(
            GetDropSlot, "workcell/get_drop_slot", self.handle_get_drop_slot
        )
        self._clear_workspace_srv = self.create_service(
            ClearWorkspace, "workcell/clear_workspace", self.handle_clear_workspace
        )

        self.get_logger().info(
            f"WorkcellNode initialized. SpindleTower at ({self._tower_x}, {self._tower_y}, {self._tower_z}), "
            f"capacity={self._max_capacity}, step={self._height_step}m"
        )

    @property
    def inventory(self) -> int:
        """Returns total placed gear inventory count."""
        with self._lock:
            return self._inventory

    @property
    def tower_count(self) -> int:
        """Returns number of gears currently stacked on SpindleTower (capped at max capacity)."""
        with self._lock:
            return min(self._inventory, self._max_capacity)

    @property
    def has_active_workpiece(self) -> bool:
        """Returns True if a workpiece is currently active on the table."""
        with self._lock:
            return self._active_workpiece is not None

    @property
    def active_workpiece_coords(self) -> Optional[tuple[float, float, float]]:
        """Returns active workpiece (x, y, z) coordinates or None."""
        with self._lock:
            return self._active_workpiece

    @property
    def tower_coords(self) -> tuple[float, float, float]:
        """Returns base coordinates of SpindleTower."""
        return (self._tower_x, self._tower_y, self._tower_z)

    def set_workpiece_coords(self, coords: tuple[float, float, float]) -> None:
        """Sets active table workpiece coordinates."""
        with self._lock:
            self._active_workpiece = (float(coords[0]), float(coords[1]), float(coords[2]))

    def clear_workpiece(self) -> None:
        """Clears active table workpiece coordinates."""
        with self._lock:
            self._active_workpiece = None

    def publish_inventory(self, count: int) -> None:
        """Emits current inventory count to workcell/inventory topic."""
        msg = Int32()
        msg.data = int(count)
        self._inventory_pub.publish(msg)

    def handle_get_drop_slot(
        self, request: GetDropSlot.Request, response: GetDropSlot.Response
    ) -> GetDropSlot.Response:
        """Calculates next vacant drop slot coordinates and enforces FIFO bottom-drop on overflow."""
        with self._lock:
            current_k = self._inventory
            if current_k < self._max_capacity:
                slot_index = current_k
                z_k = (slot_index % self._max_capacity) * self._height_step
                overflow_occurred = False
            else:
                # FIFO bottom-drop behavior on overflow (k > 10 / current_k >= 10)
                # Oldest bottom gear drops off, stack shifts down by 1 slot, new gear lands at top slot
                slot_index = self._max_capacity - 1
                z_k = slot_index * self._height_step
                overflow_occurred = True

            self._inventory += 1
            new_count = self._inventory
            self.publish_inventory(new_count)

        response.drop_coords = Point(
            x=float(self._tower_x),
            y=float(self._tower_y),
            z=float(self._tower_z + z_k),
        )
        response.slot_index = int(slot_index)
        response.overflow_occurred = bool(overflow_occurred)

        self.get_logger().info(
            f"Allocated drop slot {slot_index} at ({response.drop_coords.x:.2f}, "
            f"{response.drop_coords.y:.2f}, {response.drop_coords.z:.3f}), "
            f"overflow={overflow_occurred}, inventory={new_count}"
        )
        return response

    def handle_clear_workspace(
        self, request: ClearWorkspace.Request, response: ClearWorkspace.Response
    ) -> ClearWorkspace.Response:
        """Resets SpindleTower inventory and table workpiece coordinates to 0."""
        with self._lock:
            self._inventory = 0
            self._active_workpiece = None
            self.publish_inventory(0)

        response.success = True
        response.message = "Workspace reset"
        self.get_logger().info("Workspace reset: inventory cleared and active workpiece purged")
        return response


def main(args: list[str] | None = None) -> None:
    rclpy.init(args=args)
    node = WorkcellNode()
    try:
        rclpy.spin(node)
    except (KeyboardInterrupt, ExternalShutdownException):
        pass
    finally:
        node.destroy_node()
        if rclpy.ok():
            rclpy.shutdown()


if __name__ == "__main__":
    main()
