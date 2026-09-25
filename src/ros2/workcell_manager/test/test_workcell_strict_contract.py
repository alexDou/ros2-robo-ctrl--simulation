"""Strict SRV contract tests (hand-sim-m7sd): no color/intact defaults.

Seam: WorkcellNode service handlers (public ROS service boundary).
- SpawnObject with empty/unknown color rejected (no silent WHITE fallback).
- GetDropSlot bare query (empty color sentinel from arm client) still
  routes, following the active gear.
- GetDropSlot with unknown color rejected (slot_index=-1).
"""

import pytest
import rclpy
from geometry_msgs.msg import Point

from robot_control_interfaces.srv import (
    CommitDrop,
    GetDropSlot,
    MarkGrasped,
    SpawnObject,
)
from domain import GREEN_TOWER, SCRAP_BIN, WHITE_TOWER
from workcell_manager.workcell_node import WorkcellNode


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


def test_spawn_rejects_empty_color():
    node = WorkcellNode()
    try:
        out = _spawn(node, color="", intact=True)
        assert out.success is False
        assert out.gear_id == ""
        assert node.spawned == []
    finally:
        node.destroy_node()


def test_spawn_rejects_unknown_color():
    node = WorkcellNode()
    try:
        out = _spawn(node, color="RED", intact=True)
        assert out.success is False
        assert out.gear_id == ""
        assert node.spawned == []
    finally:
        node.destroy_node()


def test_spawn_accepts_explicit_classification():
    node = WorkcellNode()
    try:
        out = _spawn(node, color="GREEN", intact=False)
        assert out.success is True
        assert out.gear_id != ""
        entry = node.spawned[0]
        assert entry["color"] == "GREEN"
        assert entry["intact"] is False
    finally:
        node.destroy_node()


def test_bare_drop_slot_routes_white_when_idle():
    node = WorkcellNode()
    try:
        out = node.handle_get_drop_slot(GetDropSlot.Request(color="", intact=True), GetDropSlot.Response())
        assert out.slot_index == 0
        assert out.overflow_occurred is False
        assert pytest.approx(out.drop_coords.x) == WHITE_TOWER[0]
        assert pytest.approx(out.drop_coords.y) == WHITE_TOWER[1]
    finally:
        node.destroy_node()


def test_bare_drop_slot_follows_active_gear():
    node = WorkcellNode()
    try:
        out = _spawn(node, color="GREEN", intact=True)
        assert out.success is True
        slot = node.handle_get_drop_slot(GetDropSlot.Request(color="", intact=True), GetDropSlot.Response())
        assert pytest.approx(slot.drop_coords.x) == GREEN_TOWER[0]
        assert pytest.approx(slot.drop_coords.y) == GREEN_TOWER[1]
        node.handle_mark_grasped(MarkGrasped.Request(), MarkGrasped.Response())
        node.handle_commit_drop(CommitDrop.Request(), CommitDrop.Response())
        out2 = _spawn(node, color="BLUE", intact=False)
        assert out2.success is True
        slot2 = node.handle_get_drop_slot(GetDropSlot.Request(color="", intact=True), GetDropSlot.Response())
        assert pytest.approx(slot2.drop_coords.x) == SCRAP_BIN[0]
        assert pytest.approx(slot2.drop_coords.y) == SCRAP_BIN[1]
    finally:
        node.destroy_node()


def test_drop_slot_rejects_unknown_color():
    node = WorkcellNode()
    try:
        req = GetDropSlot.Request(color="RED", intact=True)
        out = node.handle_get_drop_slot(req, GetDropSlot.Response())
        assert out.slot_index == -1
    finally:
        node.destroy_node()
