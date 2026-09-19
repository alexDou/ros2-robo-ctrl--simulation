"""Handshake-gated spin: STANDBY park, ENGAGE spin, STANDBY re-park.

Covers hand-sim-4ecs (Refactor-B.2): ordered ENGAGE activation —
switch controllers first, then joint subscription, then homing — so a
rejected switch leaves the arm parked with a standby error.
"""

import threading
import time

import pytest
import rclpy
from rclpy.executors import MultiThreadedExecutor
from rclpy.parameter import Parameter

from domain import CommandType, RobotCommand, RobotState

from arm_controller.edge_bridge_node import EdgeBridgeNode


@pytest.fixture(autouse=True)
def ros_context():
    if not rclpy.ok():
        rclpy.init()
    yield
    if rclpy.ok():
        rclpy.shutdown()


def _cmd(cid: str, ctype: CommandType) -> RobotCommand:
    return RobotCommand(
        command_id=cid,
        sender_id="test-client",
        timestamp_ns=time.time_ns(),
        type=ctype,
        payload={},
    )


def _make_node(name: str) -> EdgeBridgeNode:
    return EdgeBridgeNode(
        parameter_overrides=[
            Parameter("robot_id", Parameter.Type.STRING, name),
            Parameter("auto_home_on_startup", Parameter.Type.BOOL, False),
            Parameter("auto_connect_zenoh", Parameter.Type.BOOL, False),
            Parameter("switch_timeout", Parameter.Type.DOUBLE, 0.1),
        ]
    )


def test_starts_standby_with_no_joint_sub():
    node = _make_node("test-hs-init")
    try:
        assert node.robot_state == RobotState.STANDBY
        assert node._joint_sub is None
    finally:
        node.close()
        node.destroy_node()


def test_motion_rejected_while_standby():
    node = _make_node("test-hs-reject")
    try:
        res = node.handle_command(
            RobotCommand(
                command_id="m1",
                sender_id="t",
                timestamp_ns=time.time_ns(),
                type=CommandType.TRAJECTORY_EXECUTE,
                payload={"pose_name": "HOME"},
            )
        )
        assert res is None
        assert node.robot_state == RobotState.STANDBY
    finally:
        node.close()
        node.destroy_node()


def test_engage_goes_idle_and_creates_joint_sub(make_switch_server):
    node = _make_node("test-hs-engage")
    executor = MultiThreadedExecutor()
    executor.add_node(node)
    make_switch_server(executor, ok=True)
    spin_thread = threading.Thread(target=executor.spin, daemon=True)
    spin_thread.start()
    try:
        telem = node.handle_command(_cmd("e1", CommandType.ENGAGE))
        assert node.robot_state == RobotState.IDLE
        assert node._joint_sub is not None
        assert telem is not None
        assert telem.robot_state == RobotState.IDLE
    finally:
        executor.shutdown()
        spin_thread.join(timeout=1.0)
        node.close()
        node.destroy_node()


def test_standby_parks_and_drops_joint_sub(make_switch_server):
    node = _make_node("test-hs-park")
    executor = MultiThreadedExecutor()
    executor.add_node(node)
    make_switch_server(executor, ok=True)
    spin_thread = threading.Thread(target=executor.spin, daemon=True)
    spin_thread.start()
    try:
        node.handle_command(_cmd("e2", CommandType.ENGAGE))
        assert node.robot_state == RobotState.IDLE
        telem = node.handle_command(_cmd("s1", CommandType.STANDBY))
        assert node.robot_state == RobotState.STANDBY
        assert node._joint_sub is None
        assert telem is not None
        assert telem.robot_state == RobotState.STANDBY
        res = node.handle_command(
            RobotCommand(
                command_id="m2",
                sender_id="t",
                timestamp_ns=time.time_ns(),
                type=CommandType.PICK_AND_PLACE_TARGET,
                payload={"pick_x": 0.5, "pick_y": 0.0, "pick_z": 0.0},
            )
        )
        assert res is None
    finally:
        executor.shutdown()
        spin_thread.join(timeout=1.0)
        node.close()
        node.destroy_node()


def test_engage_switch_unavailable_stays_parked_with_error(make_switch_server):
    """ENGAGE with no switch service keeps arm parked: no sub, no homing, standby error."""
    node = _make_node("test-hs-switch-down")
    errors: list = []
    node._publish_error = lambda code, msg: errors.append((code, msg))  # type: ignore[method-assign]
    try:
        telem = node.handle_command(_cmd("e-switch-down", CommandType.ENGAGE))
        assert node.robot_state == RobotState.STANDBY
        assert node._joint_sub is None
        assert node._startup_thread is None or not node._startup_thread.is_alive()
        assert any(code == "SWITCH_CONTROLLER_FAILED" for code, _ in errors)
        assert telem is not None
        assert telem.robot_state == RobotState.STANDBY
    finally:
        node.close()
        node.destroy_node()


def test_engage_switch_rejected_stays_parked_with_error(make_switch_server):
    """ENGAGE with switch rejected (ok=False) keeps arm parked with standby error."""
    node = _make_node("test-hs-switch-reject")
    errors: list = []
    node._publish_error = lambda code, msg: errors.append((code, msg))  # type: ignore[method-assign]
    executor = MultiThreadedExecutor()
    executor.add_node(node)
    make_switch_server(executor, ok=False, message="fake reject")
    spin_thread = threading.Thread(target=executor.spin, daemon=True)
    spin_thread.start()
    try:
        telem = node.handle_command(_cmd("e-switch-reject", CommandType.ENGAGE))
        assert node.robot_state == RobotState.STANDBY
        assert node._joint_sub is None
        assert node._startup_thread is None or not node._startup_thread.is_alive()
        assert any(code == "SWITCH_CONTROLLER_FAILED" for code, _ in errors)
        assert telem is not None
        assert telem.robot_state == RobotState.STANDBY
    finally:
        executor.shutdown()
        spin_thread.join(timeout=1.0)
        node.close()
        node.destroy_node()


def test_engage_switch_accepted_reaches_ready(make_switch_server):
    """ENGAGE with switch accepted reaches ready via existing homing path."""
    node = _make_node("test-hs-switch-ok")
    executor = MultiThreadedExecutor()
    executor.add_node(node)
    make_switch_server(executor, ok=True, message="fake accept")
    spin_thread = threading.Thread(target=executor.spin, daemon=True)
    spin_thread.start()
    try:
        telem = node.handle_command(_cmd("e-switch-ok", CommandType.ENGAGE))
        assert node.robot_state == RobotState.IDLE
        assert node._joint_sub is not None
        assert telem is not None
        assert telem.robot_state == RobotState.IDLE
    finally:
        executor.shutdown()
        spin_thread.join(timeout=1.0)
        node.close()
        node.destroy_node()
