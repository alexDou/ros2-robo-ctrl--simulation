"""EdgeBridgeNode init and phase-telemetry tests."""

import time

from rclpy.parameter import Parameter
from sensor_msgs.msg import JointState

from domain import (
    CANONICAL_POSES,
    PoseName,
    RobotState,
)

from arm_controller.edge_bridge_node import EdgeBridgeNode


def test_edge_bridge_initialization():
    """Asserts default parameters and initial states of EdgeBridgeNode."""
    node = EdgeBridgeNode(
        parameter_overrides=[
            Parameter("robot_id", Parameter.Type.STRING, "test-arm"),
            Parameter("auto_home_on_startup", Parameter.Type.BOOL, False),
            Parameter("auto_connect_zenoh", Parameter.Type.BOOL, False),
            Parameter("switch_timeout", Parameter.Type.DOUBLE, 0.1),
        ]
    )
    try:
        assert node.robot_id == "test-arm"
        assert node.robot_state == RobotState.STANDBY
        assert len(node.current_joints) == 6
        assert node.current_joints == CANONICAL_POSES[PoseName.HOME]
    finally:
        node.close()
        node.destroy_node()


def test_edge_bridge_telemetry_carries_phase():
    """Unit 6.6.7/4ixr: publish_telemetry includes tracked _current_phase."""
    node = EdgeBridgeNode(
        parameter_overrides=[
            Parameter("robot_id", Parameter.Type.STRING, "test-arm-phase"),
            Parameter("auto_home_on_startup", Parameter.Type.BOOL, False),
            Parameter("auto_connect_zenoh", Parameter.Type.BOOL, False),
            Parameter("switch_timeout", Parameter.Type.DOUBLE, 0.1),
        ]
    )
    try:
        assert node.current_phase is None
        event = node.publish_telemetry()
        assert event.phase is None

        node._current_phase = "RELEASING"
        event = node.publish_telemetry(command_id="cmd-phase-1")
        assert event.phase == "RELEASING"
    finally:
        node.close()
        node.destroy_node()
