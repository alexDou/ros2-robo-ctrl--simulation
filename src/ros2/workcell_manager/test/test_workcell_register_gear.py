"""Batch registration at the eye stop: intact pickable, defective Rejected (hand-sim-ull1)."""

import pytest
import rclpy
from geometry_msgs.msg import Point
from robot_control_interfaces.srv import ClearWorkspace, MarkGrasped, RegisterGear
from workcell_manager.workcell_node import WorkcellNode


@pytest.fixture(autouse=True)
def ros_context():
    if not rclpy.ok():
        rclpy.init()
    yield
    if rclpy.ok():
        rclpy.shutdown()


def _register(node, gear_id, intact=True, color="GREEN", x=0.4, y=0.1):
    req = RegisterGear.Request(
        id=gear_id, coords=Point(x=x, y=y, z=0.0), color=color, intact=intact
    )
    return node.handle_register_gear(req, RegisterGear.Response())


def test_intact_is_pickable_at_tracked_position():
    node = WorkcellNode()
    try:
        assert _register(node, "belt-1", x=0.41, y=0.2).success is True
        (entry,) = node.spawned
        assert (entry["id"], entry["color"], entry["intact"]) == ("belt-1", "GREEN", True)
        assert (entry["x"], entry["y"]) == (0.41, 0.2)
        assert node.rejected == []
    finally:
        node.destroy_node()


def test_defective_is_rejected_not_pickable_not_processed():
    node = WorkcellNode()
    try:
        assert _register(node, "belt-2", intact=False, color="BLUE").success is True
        (entry,) = node.rejected
        assert (entry["id"], entry["color"], entry["intact"]) == ("belt-2", "BLUE", False)
        assert node.spawned == []
        assert node.processed == []
        assert node.inventory == 0
        grasp = node.handle_mark_grasped(MarkGrasped.Request(), MarkGrasped.Response())
        assert grasp.success is False
    finally:
        node.destroy_node()


def test_whole_batch_registers_in_order_and_is_idempotent():
    node = WorkcellNode()
    try:
        _register(node, "belt-1", y=0.3)
        _register(node, "belt-2", intact=False, y=0.2)
        _register(node, "belt-3", y=0.1)
        _register(node, "belt-1", y=0.3)
        assert [e["id"] for e in node.spawned] == ["belt-1", "belt-3"]
        assert [e["id"] for e in node.rejected] == ["belt-2"]
    finally:
        node.destroy_node()


def test_invalid_input_is_refused():
    node = WorkcellNode()
    try:
        assert _register(node, "belt-1", color="").success is False
        assert _register(node, "belt-1", color="PINK").success is False
        assert _register(node, "", color="WHITE").success is False
        assert _register(node, "belt-1", x=float("nan")).success is False
        assert node.spawned == [] and node.rejected == []
    finally:
        node.destroy_node()


def test_snapshot_carries_rejected_and_clear_wipes_it():
    node = WorkcellNode()
    try:
        _register(node, "belt-2", intact=False)
        assert [e["id"] for e in node.get_snapshot()["rejected"]] == ["belt-2"]
        node.handle_clear_workspace(ClearWorkspace.Request(), ClearWorkspace.Response())
        assert node.get_snapshot()["rejected"] == []
    finally:
        node.destroy_node()
