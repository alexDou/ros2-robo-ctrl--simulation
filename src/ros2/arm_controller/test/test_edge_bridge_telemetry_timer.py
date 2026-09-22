"""Unit 6.7.6 red: edge 10Hz steady telemetry timer (same single owner)."""
import rclpy
from rclpy.parameter import Parameter

from domain import RobotState
from arm_controller.edge_bridge_node import EdgeBridgeNode


def _make_node(robot_id: str) -> EdgeBridgeNode:
    if not rclpy.ok():
        rclpy.init()
    return EdgeBridgeNode(parameter_overrides=[
        Parameter("robot_id", Parameter.Type.STRING, robot_id),
        Parameter("auto_home_on_startup", Parameter.Type.BOOL, False),
        Parameter("auto_connect_zenoh", Parameter.Type.BOOL, False),
        Parameter("switch_timeout", Parameter.Type.DOUBLE, 0.1),
    ])


def test_edge_has_10hz_telemetry_timer():
    node = _make_node("t-timer-exists")
    try:
        assert node._telemetry_timer is not None
        period_ns = node._telemetry_timer.timer_period_ns
        assert abs(period_ns - 100_000_000) < 5_000_000
    finally:
        node.close()
        node.destroy_node()
        if rclpy.ok():
            rclpy.shutdown()


def test_edge_timer_publishes_cached_snapshot_when_engaged():
    node = _make_node("t-timer-pub")
    try:
        with node._lock:
            node._robot_state = RobotState.IDLE
            node._current_joints = [0.5, -0.5, 0.5, -0.5, 0.5, -0.5]
        event = node._on_telemetry_timer()
        assert event is not None
        assert list(event.joint_positions) == [0.5, -0.5, 0.5, -0.5, 0.5, -0.5]
        assert event.robot_state == RobotState.IDLE
    finally:
        node.close()
        node.destroy_node()
        if rclpy.ok():
            rclpy.shutdown()


def test_edge_timer_quiet_while_standby():
    node = _make_node("t-timer-quiet")
    try:
        with node._lock:
            node._robot_state = RobotState.STANDBY
        assert node._on_telemetry_timer() is None
    finally:
        node.close()
        node.destroy_node()
        if rclpy.ok():
            rclpy.shutdown()
