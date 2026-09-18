"""Unit tests for WorkcellNode and inventory lifecycle services (Refactor-A.1, hand-sim-6bdr)."""

import threading
import time
import pytest
import rclpy
from rclpy.executors import SingleThreadedExecutor
from geometry_msgs.msg import Point
from std_msgs.msg import Int32

from robot_control_interfaces.srv import ClearWorkspace, GetDropSlot
from workcell_manager.workcell_node import (
    DEFAULT_SPINDLE_TOWER_COORDS,
    GEAR_STACK_HEIGHT_STEP_M,
    MAX_TOWER_STACK_CAPACITY,
    WorkcellNode,
)


@pytest.fixture(autouse=True)
def ros_context():
    if not rclpy.ok():
        rclpy.init()
    yield
    if rclpy.ok():
        rclpy.shutdown()


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
        # Assert consecutive calls to get_drop_slot increment z_k up to 10 slots
        for k in range(MAX_TOWER_STACK_CAPACITY):
            req = GetDropSlot.Request()
            res = GetDropSlot.Response()
            out_res = node.handle_get_drop_slot(req, res)

            expected_z = (k % MAX_TOWER_STACK_CAPACITY) * GEAR_STACK_HEIGHT_STEP_M
            assert out_res.slot_index == k
            assert pytest.approx(out_res.drop_coords.x) == DEFAULT_SPINDLE_TOWER_COORDS[0]
            assert pytest.approx(out_res.drop_coords.y) == DEFAULT_SPINDLE_TOWER_COORDS[1]
            assert pytest.approx(out_res.drop_coords.z) == expected_z
            assert out_res.overflow_occurred is False
            assert node.inventory == k + 1
            assert node.tower_count == k + 1

        assert node.inventory == 10
        assert node.tower_count == 10
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
        req = GetDropSlot.Request()
        res = GetDropSlot.Response()
        out_res = node.handle_get_drop_slot(req, res)
        assert pytest.approx(out_res.drop_coords.z) == 0.05
        assert out_res.slot_index == 0

        # Slot 1
        req2 = GetDropSlot.Request()
        res2 = GetDropSlot.Response()
        out_res2 = node.handle_get_drop_slot(req2, res2)
        assert pytest.approx(out_res2.drop_coords.z) == 0.05 + GEAR_STACK_HEIGHT_STEP_M
        assert out_res2.slot_index == 1
    finally:
        node.destroy_node()


def test_get_drop_slot_fifo_overflow():
    node = WorkcellNode()
    try:
        # Fill 10 slots
        for _ in range(10):
            node.handle_get_drop_slot(GetDropSlot.Request(), GetDropSlot.Response())

        assert node.inventory == 10

        # 11th call: enforces FIFO bottom-drop behavior on overflow (k > 10)
        req11 = GetDropSlot.Request()
        res11 = GetDropSlot.Response()
        out11 = node.handle_get_drop_slot(req11, res11)

        assert out11.overflow_occurred is True
        assert out11.slot_index == MAX_TOWER_STACK_CAPACITY - 1  # 9 (top slot)
        assert pytest.approx(out11.drop_coords.x) == DEFAULT_SPINDLE_TOWER_COORDS[0]
        assert pytest.approx(out11.drop_coords.y) == DEFAULT_SPINDLE_TOWER_COORDS[1]
        assert pytest.approx(out11.drop_coords.z) == (MAX_TOWER_STACK_CAPACITY - 1) * GEAR_STACK_HEIGHT_STEP_M
        assert node.inventory == 11
        assert node.tower_count == MAX_TOWER_STACK_CAPACITY

        # 12th call: continuing overflow
        req12 = GetDropSlot.Request()
        res12 = GetDropSlot.Response()
        out12 = node.handle_get_drop_slot(req12, res12)
        assert out12.overflow_occurred is True
        assert out12.slot_index == 9
        assert pytest.approx(out12.drop_coords.z) == 0.18
        assert node.inventory == 12
        assert node.tower_count == MAX_TOWER_STACK_CAPACITY
    finally:
        node.destroy_node()


def test_clear_workspace_resets_inventory():
    node = WorkcellNode()
    try:
        # Place 3 gears and set workpiece
        for _ in range(3):
            node.handle_get_drop_slot(GetDropSlot.Request(), GetDropSlot.Response())
        node.set_workpiece_coords((0.45, 0.10, 0.0))

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

        # Next call starts from slot 0
        req_next = GetDropSlot.Request()
        res_next = GetDropSlot.Response()
        out_next = node.handle_get_drop_slot(req_next, res_next)
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

    spin_thread = threading.Thread(target=executor.spin, daemon=True)
    spin_thread.start()

    try:
        assert drop_slot_client.wait_for_service(timeout_sec=2.0)
        assert clear_client.wait_for_service(timeout_sec=2.0)

        # Call get_drop_slot
        future = drop_slot_client.call_async(GetDropSlot.Request())
        start_t = time.time()
        while not future.done() and time.time() - start_t < 2.0:
            time.sleep(0.01)
        assert future.done()
        res = future.result()
        assert res.slot_index == 0
        assert pytest.approx(res.drop_coords.z) == 0.0
        assert res.overflow_occurred is False

        # Wait for inventory topic publication
        start_t = time.time()
        while len(received_inventory) < 1 and time.time() - start_t < 2.0:
            time.sleep(0.01)
        assert 1 in received_inventory

        # Call clear_workspace
        clear_future = clear_client.call_async(ClearWorkspace.Request())
        start_t = time.time()
        while not clear_future.done() and time.time() - start_t < 2.0:
            time.sleep(0.01)
        assert clear_future.done()
        clear_res = clear_future.result()
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
    from robot_control_interfaces.srv import SpawnObject

    node = WorkcellNode()
    try:
        assert node.has_active_workpiece is False

        # First spawn succeeds
        req = SpawnObject.Request(coords=Point(x=0.45, y=0.1, z=0.0), object_type="GEAR")
        res = SpawnObject.Response()
        out_res = node.handle_spawn_object(req, res)
        assert out_res.success is True
        assert node.has_active_workpiece is True
        assert node.active_workpiece_coords == (0.45, 0.1, 0.0)

        # Second spawn while active is rejected
        req2 = SpawnObject.Request(coords=Point(x=0.55, y=0.15, z=0.0), object_type="GEAR")
        res2 = SpawnObject.Response()
        out_res2 = node.handle_spawn_object(req2, res2)
        assert out_res2.success is False
        assert "already active" in out_res2.message

        # Clear workspace removes active workpiece
        node.handle_clear_workspace(ClearWorkspace.Request(), ClearWorkspace.Response())
        assert node.has_active_workpiece is False

        # Spawn succeeds again after clear
        res3 = SpawnObject.Response()
        out_res3 = node.handle_spawn_object(req, res3)
        assert out_res3.success is True
        assert node.has_active_workpiece is True
    finally:
        node.destroy_node()

