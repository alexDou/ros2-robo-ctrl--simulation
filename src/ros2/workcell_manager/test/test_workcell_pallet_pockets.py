"""D38: a Pallet is a 2 x 5 nest tray; the drop slot is a pocket, filled from the arm side."""

import math

import pytest
import rclpy
from geometry_msgs.msg import Point
from robot_control_interfaces.srv import CommitDrop, GetDropSlot, MarkGrasped, SpawnObject
from workcell_manager.pallet import pocket_coords
from workcell_manager.workcell_node import WorkcellNode

from domain import (
    BLUE_TOWER,
    GREEN_TOWER,
    PALLET_CAPACITY,
    PALLET_POCKET_DEPTH_M,
    PALLET_POCKET_PITCH_M,
    PALLET_TRAY_HEIGHT_M,
    WHITE_TOWER,
)


@pytest.fixture(autouse=True)
def ros_context():
    if not rclpy.ok():
        rclpy.init()
    yield
    if rclpy.ok():
        rclpy.shutdown()


def test_pockets_are_distinct_on_the_pitch_grid_at_the_pocket_floor():
    pockets = [pocket_coords(WHITE_TOWER, k) for k in range(PALLET_CAPACITY)]
    assert len({(round(x, 6), round(y, 6)) for x, y, _ in pockets}) == PALLET_CAPACITY
    for x, y, z in pockets:
        assert pytest.approx(z) == WHITE_TOWER[2] + PALLET_TRAY_HEIGHT_M - PALLET_POCKET_DEPTH_M
        rows = (x - WHITE_TOWER[0]) / PALLET_POCKET_PITCH_M
        cols = (y - WHITE_TOWER[1]) / PALLET_POCKET_PITCH_M
        assert min(abs(rows - r) for r in (-2, -1, 0, 1, 2)) < 1e-9
        assert min(abs(cols - c) for c in (-0.5, 0.5)) < 1e-9
    # Centred on the PalletStation.
    assert pytest.approx(sum(p[0] for p in pockets) / PALLET_CAPACITY) == WHITE_TOWER[0]
    assert pytest.approx(sum(p[1] for p in pockets) / PALLET_CAPACITY) == WHITE_TOWER[1]


def test_pockets_fill_row_by_row_from_the_arm_side():
    dist = [math.hypot(x, y) for x, y, _ in (pocket_coords(GREEN_TOWER, k) for k in range(10))]
    rows = [min(dist[r * 2 : r * 2 + 2]) for r in range(5)]
    assert rows == sorted(rows)  # row 0 nearest the arm (base_link origin)
    xs = [pocket_coords(GREEN_TOWER, k)[0] for k in range(10)]
    assert xs[0] == xs[1] and xs[0] > xs[2]


def test_pocket_index_outside_the_tray_is_rejected():
    with pytest.raises(ValueError):
        pocket_coords(WHITE_TOWER, PALLET_CAPACITY)
    with pytest.raises(ValueError):
        pocket_coords(WHITE_TOWER, -1)


def _cycle(node, color):
    node.handle_spawn_object(
        SpawnObject.Request(
            coords=Point(x=0.4, y=0.0, z=0.0), object_type="GEAR", color=color, intact=True
        ),
        SpawnObject.Response(),
    )
    node.handle_mark_grasped(MarkGrasped.Request(), MarkGrasped.Response())
    return node.handle_commit_drop(CommitDrop.Request(), CommitDrop.Response())


@pytest.mark.parametrize(
    "color,station", [("WHITE", WHITE_TOWER), ("GREEN", GREEN_TOWER), ("BLUE", BLUE_TOWER)]
)
def test_drop_slot_k_is_pocket_k_of_its_colour(color, station):
    node = WorkcellNode()
    try:
        for k in range(PALLET_CAPACITY):
            slot = node.handle_get_drop_slot(
                GetDropSlot.Request(color=color, intact=True), GetDropSlot.Response()
            )
            assert slot.slot_index == k
            expected = pocket_coords(station, k)
            got = (slot.drop_coords.x, slot.drop_coords.y, slot.drop_coords.z)
            assert got == pytest.approx(expected)
            out = _cycle(node, color)
            assert (out.drop_coords.x, out.drop_coords.y, out.drop_coords.z) == pytest.approx(
                expected
            )
        assert out.overflow_occurred is True
    finally:
        node.destroy_node()
