"""Shared pytest fixtures for arm_controller EdgeBridge tests."""

import itertools

import pytest
import rclpy
from rclpy.node import Node

from controller_manager_msgs.srv import SwitchController


@pytest.fixture(autouse=True)
def ros_context():
    """Init/shutdown rclpy around each test (moved from per-file copies)."""
    if not rclpy.ok():
        rclpy.init()
    yield
    if rclpy.ok():
        rclpy.shutdown()


@pytest.fixture
def make_switch_server():
    """Factory for a fake /controller_manager/switch_controller service."""
    counter = itertools.count()
    created: list[Node] = []

    def _make(executor, ok=True, message="fake switch"):
        node = Node(f"fake_switch_server_{next(counter)}")

        def _cb(req, res):
            res.ok = bool(ok)
            res.message = str(message)
            return res

        node.create_service(
            SwitchController, "/controller_manager/switch_controller", _cb
        )
        executor.add_node(node)
        created.append(node)
        return node

    yield _make

    for node in created:
        try:
            node.destroy_node()
        except Exception:
            pass
