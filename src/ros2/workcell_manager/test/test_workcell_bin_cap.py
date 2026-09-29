"""Bin cap-100 recycle tests for WorkcellNode (hand-sim-lilk, Unit 7.3e)."""

from types import SimpleNamespace

import pytest
import rclpy
from geometry_msgs.msg import Point
from robot_control_interfaces.srv import (
    ClearWorkspace,
    CommitDrop,
    GetDropSlot,
    MarkGrasped,
    SpawnObject,
)
from workcell_manager.workcell_node import WorkcellNode

from domain import (
    MAX_SCRAP_BIN_CAPACITY,
    SCRAP_BIN,
    STACK_STEP_M,
    WHITE_TOWER,
)


@pytest.fixture(autouse=True)
def ros_context():
    if not rclpy.ok():
        rclpy.init()
    yield
    if rclpy.ok():
        rclpy.shutdown()


def _spawn(node, x=0.45, y=0.10, z=0.0, **classification):
    req = SpawnObject.Request(coords=Point(x=x, y=y, z=z), object_type="GEAR", **classification)
    return node.handle_spawn_object(req, SpawnObject.Response())


def _cycle(node, x=0.45, y=0.10, z=0.0, **classification):
    out = _spawn(node, x, y, z, **classification)
    assert out.success is True
    if classification.get("intact") is False:
        # Defective gears are booked to the ScrapBin at spawn; the arm never carries them.
        entry = node.processed[-1]
        return SimpleNamespace(
            success=True,
            slot_index=round((entry["z"] - SCRAP_BIN[2]) / STACK_STEP_M),
            overflow_occurred=False,
            drop_coords=Point(x=entry["x"], y=entry["y"], z=entry["z"]),
        )
    node.handle_mark_grasped(MarkGrasped.Request(), MarkGrasped.Response())
    return node.handle_commit_drop(CommitDrop.Request(), CommitDrop.Response())


def _reserve(node, color="", intact=True, **classification):
    return node.handle_get_drop_slot(
        GetDropSlot.Request(color=color, intact=intact, **classification),
        GetDropSlot.Response(),
    )


def _bin_entries(node):
    return [e for e in node.processed if not e.get("intact", True)]


def test_bin_cap_constant_is_100():
    assert MAX_SCRAP_BIN_CAPACITY == 100


def test_bin_piles_to_cap_with_overflow_never_set():
    node = WorkcellNode()
    try:
        for k in range(MAX_SCRAP_BIN_CAPACITY):
            res = _cycle(node, color="GREEN", intact=False)
            assert res.success is True
            assert res.slot_index == k
            assert res.overflow_occurred is False
            assert pytest.approx(res.drop_coords.x) == SCRAP_BIN[0]
            assert pytest.approx(res.drop_coords.y) == SCRAP_BIN[1]
            assert pytest.approx(res.drop_coords.z) == SCRAP_BIN[2] + k * STACK_STEP_M
        assert len(_bin_entries(node)) == MAX_SCRAP_BIN_CAPACITY
    finally:
        node.destroy_node()


def test_101st_defective_recycles_pile_to_slot_0():
    node = WorkcellNode()
    try:
        for _ in range(MAX_SCRAP_BIN_CAPACITY):
            _cycle(node, color="WHITE", intact=False)
        first_ids = {e["id"] for e in _bin_entries(node)}
        res = _cycle(node, color="BLUE", intact=False)
        assert res.success is True
        assert res.slot_index == 0
        assert res.overflow_occurred is False
        assert pytest.approx(res.drop_coords.x) == SCRAP_BIN[0]
        assert pytest.approx(res.drop_coords.y) == SCRAP_BIN[1]
        assert pytest.approx(res.drop_coords.z) == SCRAP_BIN[2]
        remaining = _bin_entries(node)
        assert len(remaining) == 1
        assert remaining[0]["color"] == "BLUE"
        assert remaining[0]["id"] not in first_ids
    finally:
        node.destroy_node()


def test_bin_recycle_leaves_towers_untouched():
    node = WorkcellNode()
    try:
        for _ in range(3):
            _cycle(node, color="WHITE", intact=True)
        _cycle(node, color="GREEN", intact=True)
        for _ in range(MAX_SCRAP_BIN_CAPACITY):
            _cycle(node, color="WHITE", intact=False)
        white_before = [
            (e["x"], e["y"], e["z"])
            for e in node.processed
            if e["color"] == "WHITE" and e.get("intact", True)
        ]
        green_before = [(e["x"], e["y"], e["z"]) for e in node.processed if e["color"] == "GREEN"]
        res = _cycle(node, color="BLUE", intact=False)
        assert res.slot_index == 0
        assert [
            (e["x"], e["y"], e["z"])
            for e in node.processed
            if e["color"] == "WHITE" and e.get("intact", True)
        ] == white_before
        assert [
            (e["x"], e["y"], e["z"]) for e in node.processed if e["color"] == "GREEN"
        ] == green_before
        assert pytest.approx(node.processed[-1]["x"]) == SCRAP_BIN[0]
    finally:
        node.destroy_node()


def test_full_bin_reservation_points_at_slot_0_no_overflow():
    node = WorkcellNode()
    try:
        for _ in range(MAX_SCRAP_BIN_CAPACITY):
            _cycle(node, color="WHITE", intact=False)
        slot = _reserve(node, color="GREEN", intact=False)
        assert slot.slot_index == 0
        assert slot.overflow_occurred is False
        assert pytest.approx(slot.drop_coords.x) == SCRAP_BIN[0]
        assert pytest.approx(slot.drop_coords.y) == SCRAP_BIN[1]
        assert pytest.approx(slot.drop_coords.z) == SCRAP_BIN[2]
        assert len(node.processed) == MAX_SCRAP_BIN_CAPACITY
    finally:
        node.destroy_node()


def test_clear_wipes_towers_plus_bin_and_restarts_pile():
    node = WorkcellNode()
    try:
        _cycle(node, color="WHITE", intact=True)
        _cycle(node, color="GREEN", intact=True)
        _cycle(node, color="BLUE", intact=True)
        _cycle(node, color="WHITE", intact=False)
        assert len(node.processed) == 4
        out = node.handle_clear_workspace(ClearWorkspace.Request(), ClearWorkspace.Response())
        assert out.success is True
        assert node.processed == []
        assert node.inventory == 0
        assert _bin_entries(node) == []
        res = _cycle(node, color="GREEN", intact=False)
        assert res.slot_index == 0
        assert res.overflow_occurred is False
        assert len(_bin_entries(node)) == 1
        tower_slot = _reserve(node, color="WHITE", intact=True)
        assert tower_slot.slot_index == 0
        assert pytest.approx(tower_slot.drop_coords.x) == WHITE_TOWER[0]
    finally:
        node.destroy_node()


def test_clear_workspace_empties_gears_towers_and_bin():
    node = WorkcellNode()
    try:
        _cycle(node, color="WHITE", intact=True)
        _cycle(node, color="GREEN", intact=False)
        _spawn(node, x=0.40, color="BLUE", intact=True)  # left on the table, not yet picked
        assert node.has_active_workpiece is True
        assert node.processed != []
        out = node.handle_clear_workspace(ClearWorkspace.Request(), ClearWorkspace.Response())
        assert out.success is True
        assert node.has_active_workpiece is False
        assert node.processed == []
        assert node.tower_count == 0
        assert _bin_entries(node) == []
        assert node.inventory == 0
    finally:
        node.destroy_node()


def test_tower_still_empties_at_10_after_bin_recycle():
    node = WorkcellNode()
    try:
        for _ in range(MAX_SCRAP_BIN_CAPACITY):
            _cycle(node, color="WHITE", intact=False)
        _cycle(node, color="BLUE", intact=False)
        for _ in range(9):
            _cycle(node, color="GREEN", intact=True)
        res = _cycle(node, color="GREEN", intact=True)
        assert res.overflow_occurred is True
        assert res.slot_index == 9
        assert [e for e in node.processed if e["color"] == "GREEN"] == []
        assert len(_bin_entries(node)) == 1
        assert pytest.approx(_bin_entries(node)[0]["x"]) == SCRAP_BIN[0]
    finally:
        node.destroy_node()
