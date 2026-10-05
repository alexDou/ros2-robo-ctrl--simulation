"""Unit tests for WorkcellNode 3-bucket gear truth (hand-sim-2be6)."""

import threading
import time

import pytest
import rclpy
from geometry_msgs.msg import Point
from rclpy.executors import SingleThreadedExecutor
from robot_control_interfaces.srv import (
    ClearWorkspace,
    CommitDrop,
    GetDropSlot,
    MarkGrasped,
    ResetStation,
    SpawnObject,
)
from std_msgs.msg import Int32
from workcell_manager.workcell_node import (
    WorkcellNode,
)

from domain import (
    PALLET_CAPACITY,
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


def _full_cycle(node, x=0.45, y=0.10, z=0.0, color="WHITE", intact=True):
    node.handle_spawn_object(
        SpawnObject.Request(
            coords=Point(x=x, y=y, z=z), object_type="GEAR", color=color, intact=intact
        ),
        SpawnObject.Response(),
    )
    node.handle_mark_grasped(MarkGrasped.Request(), MarkGrasped.Response())
    return node.handle_commit_drop(CommitDrop.Request(), CommitDrop.Response())


def test_workcell_node_initial_state():
    node = WorkcellNode()
    try:
        assert node.inventory == 0
        assert node.tower_count == 0
        assert node.has_active_workpiece is False
        assert node.active_workpiece_coords is None
    finally:
        node.destroy_node()


def test_get_drop_slot_incremental_height():
    node = WorkcellNode()
    try:
        # Pure reservation: repeated queries return slot 0, no state change.
        for _ in range(PALLET_CAPACITY):
            out_res = node.handle_get_drop_slot(
                GetDropSlot.Request(color="", intact=True), GetDropSlot.Response()
            )
            assert out_res.slot_index == 0
            assert pytest.approx(out_res.drop_coords.x) == WHITE_TOWER[0]
            assert pytest.approx(out_res.drop_coords.y) == WHITE_TOWER[1]
            assert pytest.approx(out_res.drop_coords.z) == 0.0
            assert out_res.overflow_occurred is False
            assert node.inventory == 0
        # Height grows only via spawn->grasp->commit cycles.
        for k in range(PALLET_CAPACITY - 1):
            out = _full_cycle(node)
            assert out.slot_index == k
            assert pytest.approx(out.drop_coords.z) == k * STACK_STEP_M
            assert node.inventory == k + 1
            assert node.tower_count == k + 1
        # The 10th commit lands on the top slot and the Pallet stays FULL.
        out = _full_cycle(node)
        assert out.slot_index == PALLET_CAPACITY - 1
        assert node.inventory == PALLET_CAPACITY
        assert node.tower_count == PALLET_CAPACITY
    finally:
        node.destroy_node()


def test_get_drop_slot_custom_tower_elevation():
    from rclpy.parameter import Parameter

    node = WorkcellNode(
        parameter_overrides=[
            Parameter("tower_z", Parameter.Type.DOUBLE, 0.05),
        ]
    )
    try:
        assert pytest.approx(node.tower_coords[2]) == 0.05
        out_res = node.handle_get_drop_slot(
            GetDropSlot.Request(color="", intact=True), GetDropSlot.Response()
        )
        assert pytest.approx(out_res.drop_coords.z) == 0.05
        assert out_res.slot_index == 0

        # Pure: second query unchanged until a commit lands.
        out_res2 = node.handle_get_drop_slot(
            GetDropSlot.Request(color="", intact=True), GetDropSlot.Response()
        )
        assert pytest.approx(out_res2.drop_coords.z) == 0.05
        assert out_res2.slot_index == 0

        _full_cycle(node)
        out_res3 = node.handle_get_drop_slot(
            GetDropSlot.Request(color="", intact=True), GetDropSlot.Response()
        )
        assert pytest.approx(out_res3.drop_coords.z) == 0.05 + STACK_STEP_M
        assert out_res3.slot_index == 1
    finally:
        node.destroy_node()


def test_tenth_commit_marks_the_pallet_full_and_does_not_empty_it():
    node = WorkcellNode()
    try:
        for _ in range(PALLET_CAPACITY - 1):
            out = _full_cycle(node)
            assert out.overflow_occurred is False
        assert node.inventory == PALLET_CAPACITY - 1

        out10 = _full_cycle(node, x=0.50, y=0.20)

        # The 10th gear drops on the top slot and the Pallet is FULL until ResetStation.
        assert out10.overflow_occurred is True
        assert out10.slot_index == PALLET_CAPACITY - 1
        assert pytest.approx(out10.drop_coords.x) == WHITE_TOWER[0]
        assert pytest.approx(out10.drop_coords.y) == WHITE_TOWER[1]
        assert pytest.approx(out10.drop_coords.z) == (PALLET_CAPACITY - 1) * STACK_STEP_M
        assert node.inventory == PALLET_CAPACITY
        assert node.tower_count == PALLET_CAPACITY
    finally:
        node.destroy_node()


def test_reset_station_empties_the_pallet_and_the_next_gear_starts_a_fresh_stack():
    node = WorkcellNode()
    try:
        for _ in range(PALLET_CAPACITY):
            _full_cycle(node)

        res = node.handle_reset_station(
            ResetStation.Request(station="WHITE"), ResetStation.Response()
        )

        assert res.success is True
        assert node.inventory == 0
        out = _full_cycle(node)
        assert out.slot_index == 0
        assert out.overflow_occurred is False
        assert node.tower_count == 1
    finally:
        node.destroy_node()


def test_reset_station_zeroes_only_that_colour():
    node = WorkcellNode()
    try:
        for color, n in (("WHITE", 10), ("GREEN", 4), ("BLUE", 7)):
            for _ in range(n):
                _full_cycle(node, color=color)
        _full_cycle(node, color="WHITE", intact=False)  # a ScrapBin gear is not on any Pallet

        node.handle_reset_station(ResetStation.Request(station="GREEN"), ResetStation.Response())

        snapshot = node.get_snapshot()
        by_color = {c: 0 for c in ("WHITE", "GREEN", "BLUE")}
        for e in snapshot["processed"]:
            if e["intact"]:
                by_color[e["color"]] += 1
        assert by_color == {"WHITE": 10, "GREEN": 0, "BLUE": 7}
        assert node.bin_count == 1
    finally:
        node.destroy_node()


@pytest.mark.parametrize("station", ["", "RED", "white"])
def test_reset_station_rejects_anything_but_a_pallet_colour(station):
    node = WorkcellNode()
    try:
        _full_cycle(node)

        res = node.handle_reset_station(
            ResetStation.Request(station=station), ResetStation.Response()
        )

        assert res.success is False
        assert node.inventory == 1
    finally:
        node.destroy_node()


def test_clear_workspace_resets_inventory():
    node = WorkcellNode()
    try:
        for _ in range(3):
            _full_cycle(node)
        node.handle_spawn_object(
            SpawnObject.Request(
                coords=Point(x=0.45, y=0.10, z=0.0), object_type="GEAR", color="WHITE", intact=True
            ),
            SpawnObject.Response(),
        )

        assert node.inventory == 3
        assert node.has_active_workpiece is True
        assert node.active_workpiece_coords == (0.45, 0.10, 0.0)

        # Clear workspace
        clear_req = ClearWorkspace.Request()
        clear_res = ClearWorkspace.Response()
        out_clear = node.handle_clear_workspace(clear_req, clear_res)

        assert out_clear.success is True
        assert "reset" in out_clear.message.lower() or "cleared" in out_clear.message.lower()
        assert node.inventory == 0
        assert node.tower_count == 0
        assert node.has_active_workpiece is False
        assert node.active_workpiece_coords is None

        # Next reservation starts from slot 0
        out_next = node.handle_get_drop_slot(
            GetDropSlot.Request(color="", intact=True), GetDropSlot.Response()
        )
        assert out_next.slot_index == 0
        assert pytest.approx(out_next.drop_coords.z) == 0.0
        assert out_next.overflow_occurred is False
    finally:
        node.destroy_node()


def test_workcell_node_ros_services_and_topic_integration():
    node = WorkcellNode()
    client_node = rclpy.create_node("test_workcell_client")
    executor = SingleThreadedExecutor()
    executor.add_node(node)
    executor.add_node(client_node)

    received_inventory: list[int] = []

    def inventory_sub(msg: Int32):
        received_inventory.append(msg.data)

    client_node.create_subscription(Int32, "/workcell/inventory", inventory_sub, 10)
    drop_slot_client = client_node.create_client(GetDropSlot, "/workcell/get_drop_slot")
    clear_client = client_node.create_client(ClearWorkspace, "/workcell/clear_workspace")
    spawn_client = client_node.create_client(SpawnObject, "/workcell/spawn_object")
    grasp_client = client_node.create_client(MarkGrasped, "/workcell/mark_grasped")
    commit_client = client_node.create_client(CommitDrop, "/workcell/commit_drop")

    spin_thread = threading.Thread(target=executor.spin, daemon=True)
    spin_thread.start()

    def _call(cli, req, timeout=2.0):
        fut = cli.call_async(req)
        start_t = time.time()
        while not fut.done() and time.time() - start_t < timeout:
            time.sleep(0.01)
        assert fut.done()
        return fut.result()

    try:
        assert drop_slot_client.wait_for_service(timeout_sec=2.0)
        assert clear_client.wait_for_service(timeout_sec=2.0)
        assert spawn_client.wait_for_service(timeout_sec=2.0)
        assert grasp_client.wait_for_service(timeout_sec=2.0)
        assert commit_client.wait_for_service(timeout_sec=2.0)

        # Pure reservation: no inventory publication
        res = _call(drop_slot_client, GetDropSlot.Request(color="", intact=True))
        assert res.slot_index == 0
        assert pytest.approx(res.drop_coords.z) == 0.0
        assert res.overflow_occurred is False

        # Full cycle publishes inventory 1
        _call(
            spawn_client,
            SpawnObject.Request(
                coords=Point(x=0.45, y=0.1, z=0.0), object_type="GEAR", color="WHITE", intact=True
            ),
        )
        _call(grasp_client, MarkGrasped.Request())
        commit_res = _call(commit_client, CommitDrop.Request())
        assert commit_res.success is True

        start_t = time.time()
        while 1 not in received_inventory and time.time() - start_t < 2.0:
            time.sleep(0.01)
        assert 1 in received_inventory

        # Call clear_workspace
        clear_res = _call(clear_client, ClearWorkspace.Request())
        assert clear_res.success is True

        # Wait for inventory reset publication (0)
        start_t = time.time()
        while 0 not in received_inventory and time.time() - start_t < 2.0:
            time.sleep(0.01)
        assert 0 in received_inventory
    finally:
        executor.shutdown()
        spin_thread.join(timeout=1.0)
        node.destroy_node()
        client_node.destroy_node()


def test_workcell_spawn_object_service():
    node = WorkcellNode()
    try:
        assert node.has_active_workpiece is False

        # First spawn succeeds with backend uuid
        req = SpawnObject.Request(
            coords=Point(x=0.45, y=0.1, z=0.0), object_type="GEAR", color="WHITE", intact=True
        )
        out_res = node.handle_spawn_object(req, SpawnObject.Response())
        assert out_res.success is True
        assert out_res.gear_id != ""
        assert node.has_active_workpiece is True
        assert node.active_workpiece_coords == (0.45, 0.1, 0.0)

        # Second spawn while active is rejected
        req2 = SpawnObject.Request(
            coords=Point(x=0.55, y=0.15, z=0.0), object_type="GEAR", color="WHITE", intact=True
        )
        out_res2 = node.handle_spawn_object(req2, SpawnObject.Response())
        assert out_res2.success is False
        assert out_res2.gear_id == ""
        assert "already active" in out_res2.message

        # Clear workspace removes active workpiece
        node.handle_clear_workspace(ClearWorkspace.Request(), ClearWorkspace.Response())
        assert node.has_active_workpiece is False

        # Spawn succeeds again after clear
        out_res3 = node.handle_spawn_object(req, SpawnObject.Response())
        assert out_res3.success is True
        assert out_res3.gear_id != ""
        assert node.has_active_workpiece is True
    finally:
        node.destroy_node()


def test_spawn_object_rejects_non_finite_coords():
    import math

    node = WorkcellNode()
    try:
        for bad in (math.inf, -math.inf, math.nan):
            res = node.handle_spawn_object(
                SpawnObject.Request(
                    coords=Point(x=bad, y=0.1, z=0.0),
                    object_type="GEAR",
                    color="WHITE",
                    intact=True,
                ),
                SpawnObject.Response(),
            )
            assert res.success is False
            assert "finite" in res.message
        assert node.inventory == 0
        assert node.has_active_workpiece is False
    finally:
        node.destroy_node()
