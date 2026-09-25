"""Classification persistence through workcell services (hand-sim-c682, Unit 7.1a)."""

import pytest
import rclpy
from geometry_msgs.msg import Point

from robot_control_interfaces.srv import (
    CommitDrop,
    GetDropSlot,
    MarkGrasped,
    SpawnObject,
)
from domain import (
    SCRAP_BIN,
)
from workcell_manager.workcell_node import (
    WorkcellNode,
)


@pytest.fixture(autouse=True)
def ros_context():
    if not rclpy.ok():
        rclpy.init()
    yield
    if rclpy.ok():
        rclpy.shutdown()


def _spawn(node, x=0.45, y=0.10, z=0.0, **classification):
    req = SpawnObject.Request(
        coords=Point(x=x, y=y, z=z), object_type="GEAR", **classification
    )
    return node.handle_spawn_object(req, SpawnObject.Response())


def test_spawn_stores_classification():
    node = WorkcellNode()
    try:
        out = _spawn(node, color="GREEN", intact=False)
        assert out.success is True
        entry = node.spawned[0]
        assert entry["color"] == "GREEN"
        assert entry["intact"] is False
    finally:
        node.destroy_node()


def test_spawn_defaults_white_intact_for_old_callers():
    node = WorkcellNode()
    try:
        out = _spawn(node)
        assert out.success is True
        entry = node.spawned[0]
        assert entry["color"] == "WHITE"
        assert entry["intact"] is True
    finally:
        node.destroy_node()


def test_spawn_rejects_invalid_color():
    node = WorkcellNode()
    try:
        out = _spawn(node, color="RED")
        assert out.success is False
        assert out.gear_id == ""
        assert node.spawned == []
    finally:
        node.destroy_node()


def test_grasp_preserves_classification_and_origin():
    node = WorkcellNode()
    try:
        out = _spawn(node, x=0.45, y=0.10, z=0.0, color="BLUE", intact=False)
        res = node.handle_mark_grasped(MarkGrasped.Request(), MarkGrasped.Response())
        assert res.success is True
        entry = node.in_progress[0]
        assert entry["id"] == out.gear_id
        assert entry["color"] == "BLUE"
        assert entry["intact"] is False
        assert (entry["origin_x"], entry["origin_y"], entry["origin_z"]) == (0.45, 0.10, 0.0)
    finally:
        node.destroy_node()


def test_commit_preserves_classification_and_origin():
    node = WorkcellNode()
    try:
        out = _spawn(node, x=0.45, y=0.10, z=0.0, color="GREEN", intact=True)
        node.handle_mark_grasped(MarkGrasped.Request(), MarkGrasped.Response())
        res = node.handle_commit_drop(CommitDrop.Request(), CommitDrop.Response())
        assert res.success is True
        entry = node.processed[0]
        assert entry["id"] == out.gear_id
        assert entry["color"] == "GREEN"
        assert entry["intact"] is True
        assert (entry["origin_x"], entry["origin_y"], entry["origin_z"]) == (0.45, 0.10, 0.0)
    finally:
        node.destroy_node()


def test_get_drop_slot_accepts_classification_response_unchanged():
    node = WorkcellNode()
    try:
        req = GetDropSlot.Request(color="BLUE", intact=False)
        out = node.handle_get_drop_slot(req, GetDropSlot.Response())
        assert out.slot_index == 0
        assert out.overflow_occurred is False
        assert pytest.approx(out.drop_coords.x) == SCRAP_BIN[0]
        assert pytest.approx(out.drop_coords.y) == SCRAP_BIN[1]
        assert node.inventory == 0
        out2 = node.handle_get_drop_slot(GetDropSlot.Request(), GetDropSlot.Response())
        assert out2.slot_index == 0
        assert out2.overflow_occurred is False
    finally:
        node.destroy_node()


def test_snapshot_carries_classification():
    node = WorkcellNode()
    try:
        _spawn(node, color="GREEN", intact=False)
        snap = node.get_snapshot()
        assert snap["spawned"][0]["color"] == "GREEN"
        assert snap["spawned"][0]["intact"] is False
        node.handle_mark_grasped(MarkGrasped.Request(), MarkGrasped.Response())
        node.handle_commit_drop(CommitDrop.Request(), CommitDrop.Response())
        snap = node.get_snapshot()
        assert snap["processed"][0]["color"] == "GREEN"
        assert snap["processed"][0]["intact"] is False
    finally:
        node.destroy_node()
