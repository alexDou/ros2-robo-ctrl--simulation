"""Standalone WorkcellNode and SpindleTower inventory tracker per ADR 0004 and Refactor-A.1."""

import json
import threading
import uuid
from typing import Optional

import rclpy
from rclpy.executors import ExternalShutdownException
from rclpy.node import Node
from geometry_msgs.msg import Point
from std_msgs.msg import Int32, String

from robot_control_interfaces.srv import (
    ClearWorkspace,
    CommitDrop,
    GetDropSlot,
    MarkGrasped,
    SpawnObject,
)

from domain import (
    BLUE_TOWER,
    DEFAULT_GEAR_COLOR,
    GREEN_TOWER,
    MAX_SCRAP_BIN_CAPACITY,
    SCRAP_BIN,
    STACK_STEP_M,
    TOWER_CAPACITY,
    VALID_GEAR_COLORS,
    WHITE_TOWER,
)


class WorkcellNode(Node):
    """ROS2 node owning authoritative 3-bucket gear truth (spawned/in_progress/processed)."""

    def __init__(self, node_name: str = "workcell_node", **kwargs) -> None:
        super().__init__(node_name, **kwargs)

        self.declare_parameter("tower_x", WHITE_TOWER[0])
        self.declare_parameter("tower_y", WHITE_TOWER[1])
        self.declare_parameter("tower_z", WHITE_TOWER[2])
        self.declare_parameter("height_step", STACK_STEP_M)
        self.declare_parameter("max_capacity", TOWER_CAPACITY)

        self._tower_x = float(self.get_parameter("tower_x").value)
        self._tower_y = float(self.get_parameter("tower_y").value)
        self._tower_z = float(self.get_parameter("tower_z").value)
        self._height_step = float(self.get_parameter("height_step").value)
        self._max_capacity = int(self.get_parameter("max_capacity").value)

        self._lock = threading.Lock()
        self._spawned: dict[str, dict] = {}
        self._in_progress: dict[str, dict] = {}
        self._processed: list[dict] = []

        # Publisher for inventory count updates (compat: len(processed))
        self._inventory_pub = self.create_publisher(Int32, "workcell/inventory", 10)
        # Publisher for authoritative gear snapshot (JSON)
        self._state_pub = self.create_publisher(String, "workcell/state", 10)

        # Service servers for drop slot reservation, spawning, grasp/commit, clearing
        self._get_drop_slot_srv = self.create_service(
            GetDropSlot, "workcell/get_drop_slot", self.handle_get_drop_slot
        )
        self._clear_workspace_srv = self.create_service(
            ClearWorkspace, "workcell/clear_workspace", self.handle_clear_workspace
        )
        self._spawn_object_srv = self.create_service(
            SpawnObject, "workcell/spawn_object", self.handle_spawn_object
        )
        self._mark_grasped_srv = self.create_service(
            MarkGrasped, "workcell/mark_grasped", self.handle_mark_grasped
        )
        self._commit_drop_srv = self.create_service(
            CommitDrop, "workcell/commit_drop", self.handle_commit_drop
        )

        # 1 Hz heartbeat so late joiners get a snapshot; never drives transitions.
        self._heartbeat_timer = self.create_timer(1.0, self._publish_state)

        self.get_logger().info(
            f"WorkcellNode initialized. SpindleTower at ({self._tower_x}, {self._tower_y}, {self._tower_z}), "
            f"capacity={self._max_capacity}, step={self._height_step}m"
        )

    @property
    def spawned(self) -> list[dict]:
        """Returns gears resting on the table awaiting pickup."""
        with self._lock:
            return [dict(e) for e in self._spawned.values()]

    @property
    def in_progress(self) -> list[dict]:
        """Returns gears currently grasped or in transit."""
        with self._lock:
            return [dict(e) for e in self._in_progress.values()]

    @property
    def processed(self) -> list[dict]:
        """Returns gears deposited at drop slots, in stack order."""
        with self._lock:
            return [dict(e) for e in self._processed]

    @property
    def inventory(self) -> int:
        """Returns total placed gear count (compat: len(processed))."""
        with self._lock:
            return len(self._processed)

    @property
    def tower_count(self) -> int:
        """Returns WHITE-tower fill capped at max capacity (compat: single-tower flows)."""
        with self._lock:
            return min(self._tower_fill_locked(DEFAULT_GEAR_COLOR), self._max_capacity)

    @property
    def has_active_workpiece(self) -> bool:
        """Returns True if a gear is currently spawned or in transit."""
        with self._lock:
            return bool(self._spawned or self._in_progress)

    @property
    def active_workpiece_coords(self) -> Optional[tuple[float, float, float]]:
        """Returns active gear (x, y, z) coordinates or None."""
        with self._lock:
            for entry in list(self._spawned.values()) + list(self._in_progress.values()):
                return (entry["x"], entry["y"], entry["z"])
            return None

    @property
    def tower_coords(self) -> tuple[float, float, float]:
        """Returns base coordinates of SpindleTower."""
        return (self._tower_x, self._tower_y, self._tower_z)

    def get_snapshot(self) -> dict:
        """Returns current authoritative gear snapshot."""
        with self._lock:
            return self._snapshot_locked()

    def _snapshot_locked(self) -> dict:
        active_id: Optional[str] = None
        for bucket in (self._spawned, self._in_progress):
            if bucket:
                active_id = next(iter(bucket))
                break
        return {
            "spawned": [dict(e) for e in self._spawned.values()],
            "in_progress": [dict(e) for e in self._in_progress.values()],
            "processed": [dict(e) for e in self._processed],
            "active_id": active_id,
        }

    def _publish_state(self) -> None:
        with self._lock:
            snapshot = self._snapshot_locked()
        msg = String()
        msg.data = json.dumps(snapshot)
        self._state_pub.publish(msg)

    def publish_inventory(self, count: int) -> None:
        """Emits current inventory count to workcell/inventory topic."""
        msg = Int32()
        msg.data = int(count)
        self._inventory_pub.publish(msg)

    def _slot_for_count(self, count: int) -> tuple[int, float, bool]:
        """Computes (slot_index, z_k, overflow) for a given processed count."""
        if count < self._max_capacity:
            return count, count * self._height_step, False
        return self._max_capacity - 1, (self._max_capacity - 1) * self._height_step, True

    def _destination_for(
        self, color: str, intact: bool
    ) -> tuple[tuple[float, float, float], bool]:
        """Returns (base_xyz, uncapped) for a classification; unsound dominates color."""
        if not intact:
            return SCRAP_BIN, True
        if color == "GREEN":
            return GREEN_TOWER, False
        if color == "BLUE":
            return BLUE_TOWER, False
        return (self._tower_x, self._tower_y, self._tower_z), False

    def _tower_fill_locked(self, color: str) -> int:
        """Counts sound gears of one color resting on its tower."""
        base = self._destination_for(color, True)[0]
        return sum(
            1
            for e in self._processed
            if e.get("color", DEFAULT_GEAR_COLOR) == color
            and e.get("intact", True)
            and (e["x"], e["y"]) == (base[0], base[1])
        )

    def _bin_fill_locked(self) -> int:
        """Counts unsound gears piled in the ScrapBin (cap-100, sharp-cut recycle)."""
        return sum(1 for e in self._processed if not e.get("intact", True))

    def _bin_slot_locked(self) -> tuple[int, float]:
        """Returns (slot_index, z_k) for next bin arrival; wraps to 0 at cap."""
        count = self._bin_fill_locked()
        if count >= MAX_SCRAP_BIN_CAPACITY:
            return 0, 0.0
        return count, count * self._height_step

    def _recycle_bin_locked(self) -> None:
        """Discards the old bin pile in place; towers untouched (sharp cut)."""
        self._processed = [e for e in self._processed if e.get("intact", True)]

    def _active_classification_locked(self) -> Optional[tuple[str, bool]]:
        """Returns (color, intact) of the spawned/in-progress gear, if any."""
        for bucket in (self._spawned, self._in_progress):
            if bucket:
                entry = next(iter(bucket.values()))
                return (
                    str(entry.get("color", DEFAULT_GEAR_COLOR)),
                    bool(entry.get("intact", True)),
                )
        return None

    def handle_get_drop_slot(
        self, request: GetDropSlot.Request, response: GetDropSlot.Response
    ) -> GetDropSlot.Response:
        """Pure reservation: routes by classification, no state change.

        Bare-query sentinel: arm client sends empty color + intact=True (no
        classification plumbing). Empty color follows the active gear; when
        idle the intact bit is honored (sound->WHITE tower, unsound->bin).
        Non-empty color must be WHITE, GREEN, or BLUE; unknown rejected
        with slot_index=-1 and zero coords (no slot).
        """
        raw_color = str(getattr(request, "color", "") or "")
        intact = bool(getattr(request, "intact", True))
        with self._lock:
            if raw_color == "":
                active = self._active_classification_locked()
                if active is not None:
                    color, intact = active
                else:
                    # Idle sentinel: color unclassified->WHITE, intact as sent.
                    # (Documented sentinel sends intact=True; zero-init
                    # intact=False fails safe toward the bin, never the tower.)
                    color = DEFAULT_GEAR_COLOR
            else:
                color = raw_color
                if color not in VALID_GEAR_COLORS:
                    response.drop_coords = Point(x=0.0, y=0.0, z=0.0)
                    response.slot_index = -1
                    response.overflow_occurred = False
                    self.get_logger().warning(
                        f"Rejecting get_drop_slot: invalid color '{color}'"
                    )
                    return response
            base, uncapped = self._destination_for(color, intact)
            if uncapped:
                slot_index, z_k = self._bin_slot_locked()
                overflow_occurred = False
            else:
                slot_index, z_k, overflow_occurred = self._slot_for_count(
                    self._tower_fill_locked(color)
                )

        response.drop_coords = Point(
            x=float(base[0]),
            y=float(base[1]),
            z=float(base[2] + z_k),
        )
        response.slot_index = int(slot_index)
        response.overflow_occurred = bool(overflow_occurred)
        return response

    def handle_clear_workspace(
        self, request: ClearWorkspace.Request, response: ClearWorkspace.Response
    ) -> ClearWorkspace.Response:
        """Wipes all three buckets and publishes zero snapshot."""
        with self._lock:
            self._spawned.clear()
            self._in_progress.clear()
            self._processed.clear()
        self._publish_state()
        self.publish_inventory(0)

        response.success = True
        response.message = "Workspace reset"
        self.get_logger().info("Workspace reset: all buckets wiped")
        return response

    def handle_spawn_object(
        self, request: SpawnObject.Request, response: SpawnObject.Response
    ) -> SpawnObject.Response:
        """Spawns gear on the table if no gear is spawned or in transit."""
        with self._lock:
            if self._spawned or self._in_progress:
                response.success = False
                response.message = "Workpiece already active on table"
                response.gear_id = ""
                self.get_logger().warning("Rejecting spawn_object: workcell busy")
                return response
            color = str(getattr(request, "color", "") or "")
            if color not in VALID_GEAR_COLORS:
                response.success = False
                response.message = (
                    f"Missing gear color (REQUIRED color + intact)"
                    if not color
                    else f"Invalid gear color '{color}'"
                )
                response.gear_id = ""
                self.get_logger().warning(f"Rejecting spawn_object: {response.message}")
                return response
            intact = bool(getattr(request, "intact", False))
            gear_id = uuid.uuid4().hex
            self._spawned[gear_id] = {
                "id": gear_id,
                "x": float(request.coords.x),
                "y": float(request.coords.y),
                "z": float(request.coords.z),
                "color": color,
                "intact": intact,
            }
        self._publish_state()

        response.success = True
        response.message = "Object spawned"
        response.gear_id = gear_id
        self.get_logger().info(
            f"Spawned gear {gear_id} at ({request.coords.x:.3f}, {request.coords.y:.3f}, {request.coords.z:.3f})"
        )
        return response

    def handle_mark_grasped(
        self, request: MarkGrasped.Request, response: MarkGrasped.Response
    ) -> MarkGrasped.Response:
        """Moves single spawned entry to in_progress, keeping origin=pick xyz."""
        with self._lock:
            if not self._spawned:
                response.success = False
                response.message = "No spawned gear to grasp"
                return response
            gear_id, entry = next(iter(self._spawned.items()))
            del self._spawned[gear_id]
            self._in_progress[gear_id] = {
                "id": gear_id,
                "x": entry["x"],
                "y": entry["y"],
                "z": entry["z"],
                "origin_x": entry["x"],
                "origin_y": entry["y"],
                "origin_z": entry["z"],
                "color": entry.get("color", DEFAULT_GEAR_COLOR),
                "intact": entry.get("intact", True),
            }
        self._publish_state()

        response.success = True
        response.message = "Gear marked grasped"
        self.get_logger().info(f"Gear {gear_id} marked grasped (spawned->in_progress)")
        return response

    def handle_commit_drop(
        self, request: CommitDrop.Request, response: CommitDrop.Response
    ) -> CommitDrop.Response:
        """Moves in_progress entry to processed with drop xyz, origin preserved."""
        with self._lock:
            if not self._in_progress:
                response.success = False
                response.message = "No in-progress gear to commit"
                response.slot_index = -1
                response.overflow_occurred = False
                return response
            gear_id, entry = next(iter(self._in_progress.items()))
            del self._in_progress[gear_id]
            color = str(entry.get("color", ""))
            if color not in VALID_GEAR_COLORS:
                response.success = False
                response.message = f"Invalid stored gear color '{color}'"
                response.slot_index = -1
                response.overflow_occurred = False
                self.get_logger().error(f"Aborting commit_drop: {response.message}")
                return response
            intact = bool(entry.get("intact", False))
            base, uncapped = self._destination_for(color, intact)
            if uncapped:
                if self._bin_fill_locked() >= MAX_SCRAP_BIN_CAPACITY:
                    self._recycle_bin_locked()
                slot_index, z_k = self._bin_slot_locked()
                overflow_occurred = False
            else:
                fill = self._tower_fill_locked(color)
                slot_index, z_k, overflow_occurred = self._slot_for_count(fill)
                if overflow_occurred:
                    # Per-tower FIFO: evict this tower's oldest bottom gear,
                    # shift only this tower down one slot.
                    for j, older in enumerate(self._processed):
                        if (
                            older.get("color", DEFAULT_GEAR_COLOR) == color
                            and older.get("intact", True)
                            and (older["x"], older["y"]) == (base[0], base[1])
                        ):
                            del self._processed[j]
                            break
                    i = 0
                    for older in self._processed:
                        if (
                            older.get("color", DEFAULT_GEAR_COLOR) == color
                            and older.get("intact", True)
                            and (older["x"], older["y"]) == (base[0], base[1])
                        ):
                            older["z"] = float(base[2] + i * self._height_step)
                            i += 1
            drop_entry = {
                "id": gear_id,
                "x": float(base[0]),
                "y": float(base[1]),
                "z": float(base[2] + z_k),
                "origin_x": entry["origin_x"],
                "origin_y": entry["origin_y"],
                "origin_z": entry["origin_z"],
                "color": color,
                "intact": intact,
            }
            self._processed.append(drop_entry)
            new_count = len(self._processed)
        self._publish_state()
        self.publish_inventory(new_count)

        response.success = True
        response.message = "Drop committed"
        response.drop_coords = Point(x=drop_entry["x"], y=drop_entry["y"], z=drop_entry["z"])
        response.slot_index = int(slot_index)
        response.overflow_occurred = bool(overflow_occurred)
        self.get_logger().info(
            f"Committed gear {gear_id} to slot {slot_index} at ({drop_entry['x']:.2f}, "
            f"{drop_entry['y']:.2f}, {drop_entry['z']:.3f}), overflow={overflow_occurred}"
        )
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
