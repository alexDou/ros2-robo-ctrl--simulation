"""Bucket lifecycle tests for WorkcellNode 3-bucket gear truth (hand-sim-2be6)."""

import json
import threading
import time
import pytest
import rclpy
from rclpy.executors import SingleThreadedExecutor
from geometry_msgs.msg import Point
from std_msgs.msg import Int32, String

from robot_control_interfaces.srv import (
    ClearWorkspace,
    CommitDrop,
    GetDropSlot,
    MarkGrasped,
    SpawnObject,
)
from domain import (
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


def _spawn(node, x=0.45, y=0.10, z=0.0, color="WHITE", intact=True):
    req = SpawnObject.Request(coords=Point(x=x, y=y, z=z), object_type="GEAR", color=color, intact=intact)
    return node.handle_spawn_object(req, SpawnObject.Response())


def test_initial_buckets_empty():
    node = WorkcellNode()
    try:
        assert node.spawned == []
        assert node.in_progress == []
        assert node.processed == []
        assert node.inventory == 0
    finally:
        node.destroy_node()


def test_spawn_assigns_uuid_and_bucket():
    node = WorkcellNode()
    try:
        out = _spawn(node)
        assert out.success is True
        assert out.gear_id != ""
        assert len(node.spawned) == 1
        entry = node.spawned[0]
        assert entry["id"] == out.gear_id
        assert (entry["x"], entry["y"], entry["z"]) == (0.45, 0.10, 0.0)
        assert node.in_progress == []
        assert node.processed == []
    finally:
        node.destroy_node()


def test_spawn_rejects_when_busy():
    node = WorkcellNode()
    try:
        first = _spawn(node)
        assert first.success is True
        second = _spawn(node, x=0.55, y=0.15)
        assert second.success is False
        assert second.gear_id == ""
        assert len(node.spawned) == 1
        node.handle_mark_grasped(MarkGrasped.Request(), MarkGrasped.Response())
        third = _spawn(node, x=0.55, y=0.15)
        assert third.success is False
        assert len(node.spawned) == 0
        assert len(node.in_progress) == 1
    finally:
        node.destroy_node()


def test_mark_grasped_moves_with_origin():
    node = WorkcellNode()
    try:
        out = _spawn(node, x=0.45, y=0.10, z=0.0)
        res = node.handle_mark_grasped(MarkGrasped.Request(), MarkGrasped.Response())
        assert res.success is True
        assert node.spawned == []
        assert len(node.in_progress) == 1
        entry = node.in_progress[0]
        assert entry["id"] == out.gear_id
        assert (entry["x"], entry["y"], entry["z"]) == (0.45, 0.10, 0.0)
        assert (entry["origin_x"], entry["origin_y"], entry["origin_z"]) == (0.45, 0.10, 0.0)
    finally:
        node.destroy_node()


def test_mark_grasped_fails_when_empty():
    node = WorkcellNode()
    try:
        res = node.handle_mark_grasped(MarkGrasped.Request(), MarkGrasped.Response())
        assert res.success is False
    finally:
        node.destroy_node()


def test_commit_drop_moves_with_drop_xyz_and_origin():
    node = WorkcellNode()
    try:
        out = _spawn(node, x=0.45, y=0.10, z=0.0)
        node.handle_mark_grasped(MarkGrasped.Request(), MarkGrasped.Response())
        res = node.handle_commit_drop(CommitDrop.Request(), CommitDrop.Response())
        assert res.success is True
        assert res.slot_index == 0
        assert res.overflow_occurred is False
        assert node.in_progress == []
        assert len(node.processed) == 1
        entry = node.processed[0]
        assert entry["id"] == out.gear_id
        assert pytest.approx(entry["x"]) == WHITE_TOWER[0]
        assert pytest.approx(entry["y"]) == WHITE_TOWER[1]
        assert pytest.approx(entry["z"]) == WHITE_TOWER[2]
        assert (entry["origin_x"], entry["origin_y"], entry["origin_z"]) == (0.45, 0.10, 0.0)
        assert pytest.approx(res.drop_coords.z) == entry["z"]
        assert node.inventory == 1
    finally:
        node.destroy_node()


def test_commit_drop_fails_when_nothing_in_progress():
    node = WorkcellNode()
    try:
        _spawn(node)
        res = node.handle_commit_drop(CommitDrop.Request(), CommitDrop.Response())
        assert res.success is False
        assert len(node.processed) == 0
    finally:
        node.destroy_node()


def test_get_drop_slot_pure_reservation():
    node = WorkcellNode()
    try:
        for _ in range(3):
            out = node.handle_get_drop_slot(GetDropSlot.Request(color="", intact=True), GetDropSlot.Response())
            assert out.slot_index == 0
            assert out.overflow_occurred is False
        assert node.processed == []
        assert node.inventory == 0
        _spawn(node)
        node.handle_mark_grasped(MarkGrasped.Request(), MarkGrasped.Response())
        node.handle_commit_drop(CommitDrop.Request(), CommitDrop.Response())
        out = node.handle_get_drop_slot(GetDropSlot.Request(color="", intact=True), GetDropSlot.Response())
        assert out.slot_index == 1
        assert pytest.approx(out.drop_coords.z) == STACK_STEP_M
        assert node.inventory == 1
    finally:
        node.destroy_node()


def test_commit_drop_fifo_overflow():
    node = WorkcellNode()
    try:
        for _ in range(TOWER_CAPACITY):
            _spawn(node)
            node.handle_mark_grasped(MarkGrasped.Request(), MarkGrasped.Response())
            node.handle_commit_drop(CommitDrop.Request(), CommitDrop.Response())
        assert len(node.processed) == TOWER_CAPACITY
        _spawn(node, x=0.50, y=0.20)
        node.handle_mark_grasped(MarkGrasped.Request(), MarkGrasped.Response())
        res = node.handle_commit_drop(CommitDrop.Request(), CommitDrop.Response())
        assert res.success is True
        assert res.overflow_occurred is True
        assert res.slot_index == TOWER_CAPACITY - 1
        assert len(node.processed) == TOWER_CAPACITY
        assert node.tower_count == TOWER_CAPACITY
    finally:
        node.destroy_node()


def test_clear_wipes_all_buckets():
    node = WorkcellNode()
    try:
        _spawn(node)
        node.handle_mark_grasped(MarkGrasped.Request(), MarkGrasped.Response())
        node.handle_commit_drop(CommitDrop.Request(), CommitDrop.Response())
        _spawn(node, x=0.50, y=0.20)
        out = node.handle_clear_workspace(ClearWorkspace.Request(), ClearWorkspace.Response())
        assert out.success is True
        assert node.spawned == []
        assert node.in_progress == []
        assert node.processed == []
        assert node.inventory == 0
        again = _spawn(node)
        assert again.success is True
    finally:
        node.destroy_node()


def test_state_published_on_mutation():
    node = WorkcellNode()
    client_node = rclpy.create_node("test_workcell_state_client")
    executor = SingleThreadedExecutor()
    executor.add_node(node)
    executor.add_node(client_node)
    received: list[dict] = []
    received_inventory: list[int] = []
    client_node.create_subscription(
        String, "/workcell/state", lambda msg: received.append(json.loads(msg.data)), 10
    )
    client_node.create_subscription(
        Int32, "/workcell/inventory", lambda msg: received_inventory.append(msg.data), 10
    )
    spin_thread = threading.Thread(target=executor.spin, daemon=True)
    spin_thread.start()
    try:
        out = _spawn(node)
        start_t = time.time()
        while not received and time.time() - start_t < 2.0:
            time.sleep(0.01)
        assert received, "no workcell/state after spawn"
        snap = received[-1]
        assert snap["spawned"][0]["id"] == out.gear_id
        assert snap["in_progress"] == []
        assert snap["processed"] == []

        node.handle_mark_grasped(MarkGrasped.Request(), MarkGrasped.Response())
        node.handle_commit_drop(CommitDrop.Request(), CommitDrop.Response())
        start_t = time.time()
        while not any(s["processed"] for s in received) and time.time() - start_t < 2.0:
            time.sleep(0.01)
        snap = received[-1]
        assert len(snap["processed"]) == 1
        assert snap["processed"][0]["origin_x"] == pytest.approx(0.45)

        start_t = time.time()
        while 1 not in received_inventory and time.time() - start_t < 2.0:
            time.sleep(0.01)
        assert 1 in received_inventory
    finally:
        executor.shutdown()
        spin_thread.join(timeout=1.0)
        node.destroy_node()
        client_node.destroy_node()


def test_heartbeat_publishes_snapshot_without_mutation():
    node = WorkcellNode()
    client_node = rclpy.create_node("test_workcell_heartbeat_client")
    executor = SingleThreadedExecutor()
    executor.add_node(node)
    executor.add_node(client_node)
    received: list[dict] = []
    client_node.create_subscription(
        String, "/workcell/state", lambda msg: received.append(json.loads(msg.data)), 10
    )
    spin_thread = threading.Thread(target=executor.spin, daemon=True)
    spin_thread.start()
    try:
        assert node._heartbeat_timer is not None
        start_t = time.time()
        while not received and time.time() - start_t < 2.0:
            time.sleep(0.01)
        assert received, "no 1Hz heartbeat snapshot"
        assert received[-1] == {"spawned": [], "in_progress": [], "processed": [], "active_id": None}
    finally:
        executor.shutdown()
        spin_thread.join(timeout=1.0)
        node.destroy_node()
        client_node.destroy_node()
