"""Defective spawn is booked straight to the ScrapBin (hand-sim-zzvr, Unit 8.1a)."""

import pytest
import rclpy
from geometry_msgs.msg import Point
from robot_control_interfaces.srv import MarkGrasped, SpawnObject
from workcell_manager.workcell_node import WorkcellNode

from domain import MAX_SCRAP_BIN_CAPACITY, SCRAP_BIN


@pytest.fixture(autouse=True)
def ros_context():
    if not rclpy.ok():
        rclpy.init()
    yield
    if rclpy.ok():
        rclpy.shutdown()


def _spawn(node, color="GREEN", intact=False, x=0.45, y=0.10):
    req = SpawnObject.Request(
        coords=Point(x=x, y=y, z=0.0), object_type="GEAR", color=color, intact=intact
    )
    return node.handle_spawn_object(req, SpawnObject.Response())


def _bin_entries(node):
    return [e for e in node.processed if not e["intact"]]


def test_defective_spawn_goes_to_bin_without_pending_pick():
    node = WorkcellNode()
    try:
        out = _spawn(node, color="BLUE")
        assert out.success is True
        assert out.gear_id != ""
        assert node.spawned == []
        assert node.in_progress == []
        assert len(node.processed) == 1
        entry = node.processed[0]
        assert entry["id"] == out.gear_id
        assert (entry["color"], entry["intact"]) == ("BLUE", False)
        assert pytest.approx(entry["x"]) == SCRAP_BIN[0]
        assert pytest.approx(entry["y"]) == SCRAP_BIN[1]
        assert node.inventory == 1
        grasp = node.handle_mark_grasped(MarkGrasped.Request(), MarkGrasped.Response())
        assert grasp.success is False
    finally:
        node.destroy_node()


def test_defective_spawn_does_not_disturb_active_intact_pick():
    node = WorkcellNode()
    try:
        assert _spawn(node, intact=True).success is True
        assert _spawn(node, intact=False).success is True
        assert len(node.spawned) == 1
        assert len(_bin_entries(node)) == 1
        assert _spawn(node, intact=True).success is False
    finally:
        node.destroy_node()


def test_bin_empties_at_capacity():
    node = WorkcellNode()
    try:
        for _ in range(MAX_SCRAP_BIN_CAPACITY):
            _spawn(node)
        assert len(_bin_entries(node)) == MAX_SCRAP_BIN_CAPACITY
        _spawn(node, color="WHITE")
        remaining = _bin_entries(node)
        assert len(remaining) == 1
        assert remaining[0]["color"] == "WHITE"
        assert pytest.approx(remaining[0]["z"]) == SCRAP_BIN[2]
    finally:
        node.destroy_node()


def test_defective_spawn_rejects_invalid_color():
    node = WorkcellNode()
    try:
        assert _spawn(node, color="RED").success is False
        assert node.processed == []
    finally:
        node.destroy_node()
