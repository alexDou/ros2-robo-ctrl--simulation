"""4-destination routing tests for WorkcellNode (hand-sim-473u, Unit 7.1b)."""

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
    BLUE_TOWER,
    GREEN_TOWER,
    SCRAP_BIN,
    STACK_STEP_M,
    TOWER_CAPACITY,
    WHITE_TOWER,
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


def _cycle(node, x=0.45, y=0.10, z=0.0, **classification):
    out = _spawn(node, x, y, z, **classification)
    assert out.success is True
    node.handle_mark_grasped(MarkGrasped.Request(), MarkGrasped.Response())
    return node.handle_commit_drop(CommitDrop.Request(), CommitDrop.Response())


def _reserve(node, **classification):
    return node.handle_get_drop_slot(
        GetDropSlot.Request(**classification), GetDropSlot.Response()
    )


def test_sound_green_routes_to_green_tower():
    node = WorkcellNode()
    try:
        slot = _reserve(node, color="GREEN", intact=True)
        assert slot.slot_index == 0
        assert slot.overflow_occurred is False
        assert pytest.approx(slot.drop_coords.x) == GREEN_TOWER[0]
        assert pytest.approx(slot.drop_coords.y) == GREEN_TOWER[1]
        assert pytest.approx(slot.drop_coords.z) == GREEN_TOWER[2]
        res = _cycle(node, color="GREEN", intact=True)
        assert res.success is True
        assert res.slot_index == 0
        assert res.overflow_occurred is False
        entry = node.processed[0]
        assert entry["color"] == "GREEN"
        assert entry["intact"] is True
        assert pytest.approx(entry["x"]) == GREEN_TOWER[0]
        assert pytest.approx(entry["y"]) == GREEN_TOWER[1]
        assert pytest.approx(entry["z"]) == GREEN_TOWER[2]
        slot2 = _reserve(node, color="GREEN", intact=True)
        assert slot2.slot_index == 1
        assert pytest.approx(slot2.drop_coords.z) == STACK_STEP_M
    finally:
        node.destroy_node()


def test_sound_blue_routes_to_blue_tower():
    node = WorkcellNode()
    try:
        slot = _reserve(node, color="BLUE", intact=True)
        assert pytest.approx(slot.drop_coords.x) == BLUE_TOWER[0]
        assert pytest.approx(slot.drop_coords.y) == BLUE_TOWER[1]
        res = _cycle(node, color="BLUE", intact=True)
        assert res.success is True
        entry = node.processed[0]
        assert entry["color"] == "BLUE"
        assert pytest.approx(entry["x"]) == BLUE_TOWER[0]
        assert pytest.approx(entry["y"]) == BLUE_TOWER[1]
    finally:
        node.destroy_node()


def test_sound_white_byte_identical_to_today():
    node = WorkcellNode()
    try:
        slot = _reserve(node)
        assert slot.slot_index == 0
        assert slot.overflow_occurred is False
        assert pytest.approx(slot.drop_coords.x) == WHITE_TOWER[0]
        assert pytest.approx(slot.drop_coords.y) == WHITE_TOWER[1]
        assert pytest.approx(slot.drop_coords.z) == WHITE_TOWER[2]
        res = _cycle(node)
        assert res.slot_index == 0
        assert res.overflow_occurred is False
        entry = node.processed[0]
        assert entry["color"] == "WHITE"
        assert entry["intact"] is True
        assert pytest.approx(entry["x"]) == WHITE_TOWER[0]
    finally:
        node.destroy_node()


def test_intact_false_any_color_routes_to_bin_capped():
    node = WorkcellNode()
    try:
        for k, color in enumerate(("WHITE", "GREEN", "BLUE")):
            slot = _reserve(node, color=color, intact=False)
            assert slot.slot_index == k
            assert slot.overflow_occurred is False
            assert pytest.approx(slot.drop_coords.x) == SCRAP_BIN[0]
            assert pytest.approx(slot.drop_coords.y) == SCRAP_BIN[1]
            assert pytest.approx(slot.drop_coords.z) == k * STACK_STEP_M
            res = _cycle(node, color=color, intact=False)
            assert res.success is True
            assert res.slot_index == k
            assert res.overflow_occurred is False
            entry = node.processed[k]
            assert entry["color"] == color
            assert entry["intact"] is False
            assert pytest.approx(entry["x"]) == SCRAP_BIN[0]
            assert pytest.approx(entry["y"]) == SCRAP_BIN[1]
        for _ in range(TOWER_CAPACITY):
            _cycle(node, color="BLUE", intact=False)
        assert len(node.processed) == 3 + TOWER_CAPACITY
        slot = _reserve(node, color="WHITE", intact=False)
        assert slot.slot_index == 3 + TOWER_CAPACITY
        assert slot.overflow_occurred is False
        assert pytest.approx(slot.drop_coords.z) == (
            3 + TOWER_CAPACITY
        ) * STACK_STEP_M
        # 7.3e owns the cap-100 recycle edge; this routing test stays below cap.
    finally:
        node.destroy_node()


def test_towers_independent_slot_math():
    node = WorkcellNode()
    try:
        for _ in range(3):
            _cycle(node, color="WHITE", intact=True)
        res = _cycle(node, color="GREEN", intact=True)
        assert res.slot_index == 0
        green = node.processed[-1]
        assert pytest.approx(green["z"]) == GREEN_TOWER[2]
        white_slot = _reserve(node, color="WHITE", intact=True)
        assert white_slot.slot_index == 3
        assert pytest.approx(white_slot.drop_coords.z) == 3 * STACK_STEP_M
        green_slot = _reserve(node, color="GREEN", intact=True)
        assert green_slot.slot_index == 1
        blue_slot = _reserve(node, color="BLUE", intact=True)
        assert blue_slot.slot_index == 0
    finally:
        node.destroy_node()


def test_default_reservation_follows_active_entry():
    node = WorkcellNode()
    try:
        slot = _reserve(node)
        assert pytest.approx(slot.drop_coords.x) == WHITE_TOWER[0]
        _spawn(node, color="GREEN", intact=True)
        slot = _reserve(node)
        assert pytest.approx(slot.drop_coords.x) == GREEN_TOWER[0]
        assert pytest.approx(slot.drop_coords.y) == GREEN_TOWER[1]
        node.handle_mark_grasped(MarkGrasped.Request(), MarkGrasped.Response())
        node.handle_commit_drop(CommitDrop.Request(), CommitDrop.Response())
        _spawn(node, color="BLUE", intact=False)
        slot = _reserve(node)
        assert pytest.approx(slot.drop_coords.x) == SCRAP_BIN[0]
        assert pytest.approx(slot.drop_coords.y) == SCRAP_BIN[1]
        assert slot.overflow_occurred is False
    finally:
        node.destroy_node()


def test_invalid_color_reservation_follows_white():
    node = WorkcellNode()
    try:
        slot = _reserve(node, color="RED", intact=True)
        assert slot.slot_index == 0
        assert slot.overflow_occurred is False
        assert pytest.approx(slot.drop_coords.x) == WHITE_TOWER[0]
        assert pytest.approx(slot.drop_coords.y) == WHITE_TOWER[1]
    finally:
        node.destroy_node()


def test_overflow_evicts_oldest_of_same_tower_only():
    node = WorkcellNode()
    try:
        for _ in range(TOWER_CAPACITY):
            _cycle(node, color="GREEN", intact=True)
        _cycle(node, color="WHITE", intact=True)
        _cycle(node, color="WHITE", intact=True)
        white_before = [
            (e["x"], e["y"], e["z"]) for e in node.processed if e["color"] == "WHITE"
        ]
        res = _cycle(node, color="GREEN", intact=True)
        assert res.success is True
        assert res.overflow_occurred is True
        assert res.slot_index == TOWER_CAPACITY - 1
        greens = [e for e in node.processed if e["color"] == "GREEN"]
        assert len(greens) == TOWER_CAPACITY
        for i, entry in enumerate(greens):
            assert (
                pytest.approx(entry["z"])
                == GREEN_TOWER[2] + i * STACK_STEP_M
            )
        whites = [
            (e["x"], e["y"], e["z"]) for e in node.processed if e["color"] == "WHITE"
        ]
        assert whites == white_before
    finally:
        node.destroy_node()
