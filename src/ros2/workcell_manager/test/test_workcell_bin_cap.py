"""ScrapBin pile tests for WorkcellNode: no auto-empty, only a BinExchange (ResetStation SCRAP) empties it."""

from types import SimpleNamespace

import pytest
import rclpy
from geometry_msgs.msg import Point
from robot_control_interfaces.srv import (
    ClearWorkspace,
    CommitDrop,
    GetDropSlot,
    MarkGrasped,
    RegisterGear,
    ResetStation,
    ScrapRejected,
    SpawnObject,
)
from workcell_manager.workcell_node import WorkcellNode

from domain import (
    BIN_EXCHANGE_THRESHOLD,
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


def test_bin_exchange_threshold_is_20():
    assert BIN_EXCHANGE_THRESHOLD == 20


def test_bin_piles_to_cap_with_overflow_never_set():
    node = WorkcellNode()
    try:
        for k in range(BIN_EXCHANGE_THRESHOLD):
            res = _cycle(node, color="GREEN", intact=False)
            assert res.success is True
            assert res.slot_index == k
            assert res.overflow_occurred is False
            assert pytest.approx(res.drop_coords.x) == SCRAP_BIN[0]
            assert pytest.approx(res.drop_coords.y) == SCRAP_BIN[1]
            assert pytest.approx(res.drop_coords.z) == SCRAP_BIN[2] + k * STACK_STEP_M
        assert len(_bin_entries(node)) == BIN_EXCHANGE_THRESHOLD
    finally:
        node.destroy_node()


def test_bin_never_empties_itself_past_the_exchange_threshold():
    node = WorkcellNode()
    try:
        for _ in range(BIN_EXCHANGE_THRESHOLD):
            _cycle(node, color="WHITE", intact=False)
        res = _cycle(node, color="BLUE", intact=False)
        assert res.slot_index == BIN_EXCHANGE_THRESHOLD
        assert len(_bin_entries(node)) == BIN_EXCHANGE_THRESHOLD + 1
    finally:
        node.destroy_node()


def test_reset_scrap_empties_the_bin_and_leaves_pallets_untouched():
    node = WorkcellNode()
    try:
        _cycle(node, color="GREEN", intact=True)
        for _ in range(3):
            _cycle(node, color="WHITE", intact=False)
        node.handle_register_gear(
            RegisterGear.Request(id="r1", color="BLUE", intact=False), RegisterGear.Response()
        )
        node.handle_scrap_rejected(ScrapRejected.Request(count=1), ScrapRejected.Response())
        assert len(node.scrapped) == 1

        out = node.handle_reset_station(
            ResetStation.Request(station="SCRAP"), ResetStation.Response()
        )

        assert out.success is True
        assert _bin_entries(node) == []
        assert node.scrapped == []
        assert [e["color"] for e in node.processed] == ["GREEN"]
        assert node.inventory == 1
        res = _cycle(node, color="WHITE", intact=False)
        assert res.slot_index == 0
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


def test_pallet_stays_full_at_10_with_a_full_bin():
    node = WorkcellNode()
    try:
        for _ in range(BIN_EXCHANGE_THRESHOLD):
            _cycle(node, color="WHITE", intact=False)
        for _ in range(9):
            _cycle(node, color="GREEN", intact=True)
        res = _cycle(node, color="GREEN", intact=True)
        assert res.overflow_occurred is True
        assert res.slot_index == 9
        assert len([e for e in node.processed if e["color"] == "GREEN" and e["intact"]]) == 10
        assert len(_bin_entries(node)) == BIN_EXCHANGE_THRESHOLD
    finally:
        node.destroy_node()
