"""Rejected -> Scrapped when the exit eye counts a Gearwheel on a later belt run (hand-sim-mt82)."""

import pytest
import rclpy
from geometry_msgs.msg import Point
from robot_control_interfaces.srv import ClearWorkspace, RegisterGear, ScrapRejected
from workcell_manager.workcell_node import WorkcellNode


@pytest.fixture(autouse=True)
def ros_context():
    if not rclpy.ok():
        rclpy.init()
    yield
    if rclpy.ok():
        rclpy.shutdown()


def _register_defective(node, gear_id):
    req = RegisterGear.Request(
        id=gear_id, coords=Point(x=0.4, y=-0.5, z=0.0), color="BLUE", intact=False
    )
    assert node.handle_register_gear(req, RegisterGear.Response()).success


def _scrap(node, count):
    return node.handle_scrap_rejected(ScrapRejected.Request(count=count), ScrapRejected.Response())


def test_rejected_becomes_scrapped_in_order_on_exit_count():
    node = WorkcellNode()
    try:
        for gear_id in ("a", "b", "c"):
            _register_defective(node, gear_id)
        res = _scrap(node, 2)
        assert (res.success, res.scrapped) == (True, 2)
        assert [e["id"] for e in node.scrapped] == ["a", "b"]
        assert [e["id"] for e in node.rejected] == ["c"]
        assert node.get_snapshot()["scrapped"] == node.scrapped
    finally:
        node.destroy_node()


def test_bin_count_never_includes_rejected():
    node = WorkcellNode()
    try:
        _register_defective(node, "a")
        _register_defective(node, "b")
        assert node.bin_count == 0
        _scrap(node, 1)
        assert node.bin_count == 1
    finally:
        node.destroy_node()


def test_exit_count_beyond_rejected_scraps_only_what_exists():
    node = WorkcellNode()
    try:
        _register_defective(node, "a")
        res = _scrap(node, 3)  # intact Gearwheels fall in too (flush): not tracked as Rejected
        assert (res.success, res.scrapped) == (True, 1)
        assert _scrap(node, 0).scrapped == 0
    finally:
        node.destroy_node()


def test_clear_workspace_empties_scrapped():
    node = WorkcellNode()
    try:
        _register_defective(node, "a")
        _scrap(node, 1)
        node.handle_clear_workspace(ClearWorkspace.Request(), ClearWorkspace.Response())
        assert node.scrapped == [] and node.bin_count == 0
    finally:
        node.destroy_node()
