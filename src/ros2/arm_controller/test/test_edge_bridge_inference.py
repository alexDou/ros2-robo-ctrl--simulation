"""Unit 7.3d: edge telemetry reports classification via inference channel."""
import json

from std_msgs.msg import String
from rclpy.parameter import Parameter

from domain import RobotState
from arm_controller.edge_bridge_node import EdgeBridgeNode


def _make_node(robot_id: str) -> EdgeBridgeNode:
    return EdgeBridgeNode(parameter_overrides=[
        Parameter("robot_id", Parameter.Type.STRING, robot_id),
        Parameter("auto_home_on_startup", Parameter.Type.BOOL, False),
        Parameter("auto_connect_zenoh", Parameter.Type.BOOL, False),
        Parameter("switch_timeout", Parameter.Type.DOUBLE, 0.1),
    ])


def _snapshot_msg(spawned=(), in_progress=(), processed=(), active_id=None) -> String:
    m = String()
    m.data = json.dumps({
        "spawned": list(spawned),
        "in_progress": list(in_progress),
        "processed": list(processed),
        "active_id": active_id,
    })
    return m


def _gear(gear_id, color, intact, x=0.45, y=0.10, z=0.0):
    return {"id": gear_id, "x": x, "y": y, "z": z, "color": color, "intact": intact}


def test_no_active_gear_no_inference():
    node = _make_node("t-inf-none")
    try:
        event = node.publish_telemetry()
        assert event.inference_metrics is None
    finally:
        node.close()
        node.destroy_node()


def test_sound_spawned_gear_reports_color():
    node = _make_node("t-inf-color")
    try:
        node._on_workcell_state(_snapshot_msg(
            spawned=[_gear("g1", "GREEN", True)], active_id="g1"))
        event = node.publish_telemetry()
        assert event.inference_metrics is not None
        assert event.inference_metrics.detected_object == "GREEN"
    finally:
        node.close()
        node.destroy_node()


def test_defective_spawned_gear_reports_defective():
    node = _make_node("t-inf-defect")
    try:
        node._on_workcell_state(_snapshot_msg(
            spawned=[_gear("d1", "BLUE", False)], active_id="d1"))
        event = node.publish_telemetry()
        assert event.inference_metrics is not None
        assert event.inference_metrics.detected_object == "DEFECTIVE"
    finally:
        node.close()
        node.destroy_node()


def test_in_progress_gear_classification_reported():
    node = _make_node("t-inf-prog")
    try:
        node._on_workcell_state(_snapshot_msg(
            in_progress=[_gear("g2", "WHITE", True)], active_id="g2"))
        event = node.publish_telemetry()
        assert event.inference_metrics is not None
        assert event.inference_metrics.detected_object == "WHITE"
    finally:
        node.close()
        node.destroy_node()


def test_robot_state_untouched_by_inference():
    node = _make_node("t-inf-state")
    try:
        with node._lock:
            node._robot_state = RobotState.IDLE
        node._on_workcell_state(_snapshot_msg(
            spawned=[_gear("g3", "GREEN", False)], active_id="g3"))
        event = node.publish_telemetry()
        assert event.robot_state == RobotState.IDLE
        assert event.inference_metrics.detected_object == "DEFECTIVE"
    finally:
        node.close()
        node.destroy_node()
