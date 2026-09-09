"""Tests for EdgeNode ROS2 and DataFabric command ingestion."""

import json
import time
from unittest.mock import MagicMock
import pytest
from edge_node.domain import CommandType, RobotCommand, RobotState, RobotTelemetryEvent
from edge_node.node import EdgeNode


@pytest.fixture
def mock_ros_node():
    mock = MagicMock()
    mock.get_logger.return_value = MagicMock()
    return mock


def test_edge_node_command_handling_valid_ping(mock_ros_node):
    node = EdgeNode(robot_id="robot-0", ros2_node=mock_ros_node, auto_connect=False)

    ping_cmd = RobotCommand(
        command_id="cmd-ping-001",
        sender_id="ui-client",
        timestamp_ns=time.time_ns(),
        type=CommandType.PING,
        payload={},
    )
    raw_payload = ping_cmd.model_dump_json()

    event = node.handle_command_payload(raw_payload)

    assert event is not None
    assert isinstance(event, RobotTelemetryEvent)
    assert event.robot_state == RobotState.IDLE
    assert event.joint_positions == [0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
    assert event.command_id == "cmd-ping-001"

    # Assert ROS2 logger was invoked with command receipt info
    mock_ros_node.get_logger().info.assert_called()
    logged_msg = mock_ros_node.get_logger().info.call_args[0][0]
    assert "cmd-ping-001" in logged_msg
    assert "PING" in logged_msg


def test_edge_node_command_handling_malformed_payload(mock_ros_node):
    node = EdgeNode(robot_id="robot-0", ros2_node=mock_ros_node, auto_connect=False)

    # 1. Invalid JSON
    res1 = node.handle_command_payload("not valid json")
    assert res1 is None
    mock_ros_node.get_logger().error.assert_called()

    # 2. Valid JSON but invalid RobotCommand schema
    mock_ros_node.get_logger().error.reset_mock()
    invalid_schema = json.dumps({"command_id": "test", "type": "UNKNOWN_TYPE"})
    res2 = node.handle_command_payload(invalid_schema)
    assert res2 is None
    mock_ros_node.get_logger().error.assert_called()


def test_edge_node_zenoh_pub_sub_round_trip(mock_ros_node):
    import zenoh

    robot_id = "test-robot-e2e"
    edge = EdgeNode(robot_id=robot_id, ros2_node=mock_ros_node, auto_connect=True)

    # External client session to interact over Zenoh DataFabric
    client_session = zenoh.open(zenoh.Config())
    received_telemetry = []

    sub = client_session.declare_subscriber(
        f"robot/{robot_id}/telemetry",
        lambda sample: received_telemetry.append(bytes(sample.payload).decode("utf-8")),
    )
    time.sleep(0.1)

    cmd_pub = client_session.declare_publisher(f"robot/{robot_id}/command")
    ping_cmd = RobotCommand(
        command_id="ping-e2e-99",
        sender_id="tester",
        timestamp_ns=time.time_ns(),
        type=CommandType.PING,
        payload={},
    )
    cmd_pub.put(ping_cmd.model_dump_json())

    # Wait up to 1 second for telemetry round-trip
    deadline = time.time() + 1.0
    while time.time() < deadline and not received_telemetry:
        time.sleep(0.05)

    assert len(received_telemetry) >= 1
    telem_obj = RobotTelemetryEvent.model_validate_json(received_telemetry[0])
    assert telem_obj.robot_state == RobotState.IDLE
    assert telem_obj.joint_positions == [0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
    assert telem_obj.command_id == "ping-e2e-99"

    edge.close()
    client_session.close()
