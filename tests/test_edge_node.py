"""Tests for EdgeNode ROS2 and DataFabric command ingestion."""

import json
import time
from unittest.mock import MagicMock
import pytest
from domain import CommandType, RobotCommand, RobotState, RobotTelemetryEvent
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


def test_joint_state_mapper_canonical_order_and_zero_order_hold():
    import math
    from edge_node.mapper import JointStateMapper
    from sensor_msgs.msg import JointState

    mapper = JointStateMapper()
    # 1. Initial state must be exactly 6 zeros
    assert mapper.get_positions() == [0.0, 0.0, 0.0, 0.0, 0.0, 0.0]

    # 2. Out of order message with extraneous joints
    msg = JointState()
    msg.name = [
        "robotiq_85_left_knuckle_joint",
        "wrist_3_joint",
        "elbow_joint",
        "wrist_1_joint",
        "shoulder_lift_joint",
        "wrist_2_joint",
        "shoulder_pan_joint",
        "gripper_finger_joint",
    ]
    msg.position = [0.99, 0.6, 0.3, 0.4, 0.2, 0.5, 0.1, -0.99]
    positions = mapper.update_from_joint_state(msg)

    # Must be canonical sequence: [pan, lift, elbow, wrist1, wrist2, wrist3]
    expected = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]
    assert positions == expected
    assert mapper.get_positions() == expected

    # 3. Partial update preserves omitted joints (zero-order hold)
    msg2 = JointState()
    msg2.name = ["wrist_3_joint", "shoulder_pan_joint"]
    msg2.position = [0.95, 0.15]
    positions2 = mapper.update_from_joint_state(msg2)

    assert positions2 == [0.15, 0.2, 0.3, 0.4, 0.5, 0.95]
    assert mapper.get_positions() == [0.15, 0.2, 0.3, 0.4, 0.5, 0.95]

    # 4. Non-finite values (NaN / Inf) are rejected, preserving previous valid values
    msg3 = JointState()
    msg3.name = ["shoulder_lift_joint", "elbow_joint"]
    msg3.position = [float("nan"), float("inf")]
    positions3 = mapper.update_from_joint_state(msg3)

    assert positions3 == [0.15, 0.2, 0.3, 0.4, 0.5, 0.95]
    assert mapper.get_positions() == [0.15, 0.2, 0.3, 0.4, 0.5, 0.95]


def test_edge_node_joint_state_subscription_and_streaming(mock_ros_node):
    from sensor_msgs.msg import JointState

    # EdgeNode initializes mapper and joint_states subscription
    edge = EdgeNode(robot_id="robot-stream", ros2_node=mock_ros_node, auto_connect=False)
    assert hasattr(edge, "mapper")

    # Simulate arrival of joint state message
    msg = JointState()
    msg.name = [
        "shoulder_pan_joint",
        "shoulder_lift_joint",
        "elbow_joint",
        "wrist_1_joint",
        "wrist_2_joint",
        "wrist_3_joint",
    ]
    msg.position = [0.1, -0.2, 0.3, -0.4, 0.5, -0.6]
    edge.on_joint_state(msg)

    assert edge.mapper.get_positions() == [0.1, -0.2, 0.3, -0.4, 0.5, -0.6]

    # Test periodic telemetry tick emission
    event = edge.publish_telemetry_tick()
    assert event is not None
    assert event.joint_positions == [0.1, -0.2, 0.3, -0.4, 0.5, -0.6]
    assert event.robot_state == RobotState.IDLE
    assert event.timestamp_ns > 0


def test_mock_joint_state_publisher(mock_ros_node):
    from unittest.mock import patch
    import rclpy
    from edge_node.mock_publisher import MockJointStatePublisher
    from domain import CANONICAL_UR5E_JOINTS

    if not rclpy.ok():
        rclpy.init()

    pub_node = MockJointStatePublisher(rate_hz=30.0)
    try:
        msg = pub_node.create_joint_state_msg()
        assert msg.name == list(CANONICAL_UR5E_JOINTS)
        assert list(msg.position) == [0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
        assert list(msg.velocity) == [0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
        assert list(msg.effort) == [0.0, 0.0, 0.0, 0.0, 0.0, 0.0]

        pub_msg = pub_node.publish_joint_state()
        assert list(pub_msg.position) == [0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
    finally:
        pub_node.destroy_node()


def test_mock_joint_state_publisher_dynamic(mock_ros_node):
    import rclpy
    from edge_node.mock_publisher import MockJointStatePublisher

    if not rclpy.ok():
        rclpy.init()

    pub_node = MockJointStatePublisher(rate_hz=30.0, dynamic=True)
    try:
        msg = pub_node.create_joint_state_msg()
        assert len(msg.position) == 6
        # Dynamic positions should not all be zero
        assert any(pos != 0.0 for pos in msg.position)
        assert len(msg.velocity) == 6
    finally:
        pub_node.destroy_node()


def test_edge_node_lifecycle_initial_state(mock_ros_node):
    node = EdgeNode(robot_id="robot-init", ros2_node=mock_ros_node, auto_connect=False)
    assert node.robot_state == RobotState.IDLE
    assert node.palm_state.is_grasped is False


def test_edge_node_single_command_gating_busy_rejection(mock_ros_node):
    from domain import ErrorFrame

    node = EdgeNode(robot_id="robot-busy", ros2_node=mock_ros_node, auto_connect=False)
    node.robot_state = RobotState.EXECUTING

    cmd = RobotCommand(
        command_id="cmd-busy-001",
        sender_id="ui-client",
        timestamp_ns=time.time_ns(),
        type=CommandType.TRAJECTORY_EXECUTE,
        payload={"pose_name": "READY"},
    )
    res = node.handle_command_payload(cmd.model_dump_json())

    assert isinstance(res, ErrorFrame)
    assert res.error_code == "ROBOT_BUSY"
    assert node.robot_state == RobotState.EXECUTING
    mock_ros_node.get_logger().warning.assert_called()


def test_edge_node_canned_trajectory_execution(mock_ros_node):
    from domain import CANONICAL_POSES, PoseName

    node = EdgeNode(robot_id="robot-traj", ros2_node=mock_ros_node, auto_connect=False)
    assert node.mapper.get_positions() == [0.0, 0.0, 0.0, 0.0, 0.0, 0.0]

    cmd = RobotCommand(
        command_id="cmd-traj-ready",
        sender_id="ui-client",
        timestamp_ns=time.time_ns(),
        type=CommandType.TRAJECTORY_EXECUTE,
        payload={"pose_name": "READY"},
    )

    # Execute synchronously or wait
    res = node.handle_command_payload(cmd.model_dump_json(), synchronous=True)
    assert res is not None
    assert node.robot_state == RobotState.IDLE
    assert pytest.approx(node.mapper.get_positions(), abs=1e-4) == CANONICAL_POSES[PoseName.READY]


def test_edge_node_palm_actuate_pneumatic_delay(mock_ros_node):
    node = EdgeNode(robot_id="robot-palm", ros2_node=mock_ros_node, auto_connect=False)
    assert node.palm_state.is_grasped is False

    # Grasp
    cmd_grasp = RobotCommand(
        command_id="cmd-palm-grasp",
        sender_id="ui-client",
        timestamp_ns=time.time_ns(),
        type=CommandType.PALM_ACTUATE,
        payload={"action": "GRASP"},
    )
    t0 = time.monotonic()
    res = node.handle_command_payload(cmd_grasp.model_dump_json(), synchronous=True)
    elapsed = time.monotonic() - t0

    assert res is not None
    assert node.palm_state.is_grasped is True
    assert node.robot_state == RobotState.IDLE
    assert elapsed >= 0.19  # ~200ms pneumatic delay

    # Release
    cmd_release = RobotCommand(
        command_id="cmd-palm-release",
        sender_id="ui-client",
        timestamp_ns=time.time_ns(),
        type=CommandType.PALM_ACTUATE,
        payload={"action": "RELEASE"},
    )
    res2 = node.handle_command_payload(cmd_release.model_dump_json(), synchronous=True)
    assert res2 is not None
    assert node.palm_state.is_grasped is False
    assert node.robot_state == RobotState.IDLE


def test_edge_node_emergency_stop_and_reset_fault(mock_ros_node):
    node = EdgeNode(robot_id="robot-estop", ros2_node=mock_ros_node, auto_connect=False)

    # Start motion asynchronously
    cmd_traj = RobotCommand(
        command_id="cmd-traj-home",
        sender_id="ui-client",
        timestamp_ns=time.time_ns(),
        type=CommandType.TRAJECTORY_EXECUTE,
        payload={"pose_name": "HOME"},
    )
    node.handle_command_payload(cmd_traj.model_dump_json(), synchronous=False)
    time.sleep(0.08)  # let it enter EXECUTING
    assert node.robot_state in (RobotState.PROCESSING, RobotState.EXECUTING)

    # Trigger EMERGENCY_STOP
    cmd_estop = RobotCommand(
        command_id="cmd-estop-now",
        sender_id="ui-client",
        timestamp_ns=time.time_ns(),
        type=CommandType.EMERGENCY_STOP,
        payload={"reason": "Safety line trip"},
    )
    estop_res = node.handle_command_payload(cmd_estop.model_dump_json())
    assert node.robot_state == RobotState.FAULT
    assert estop_res.robot_state == RobotState.FAULT

    # Verify subsequent commands are rejected while in FAULT
    cmd_blocked = RobotCommand(
        command_id="cmd-blocked",
        sender_id="ui-client",
        timestamp_ns=time.time_ns(),
        type=CommandType.TRAJECTORY_EXECUTE,
        payload={"pose_name": "READY"},
    )
    blocked_res = node.handle_command_payload(cmd_blocked.model_dump_json())
    assert blocked_res.error_code == "ROBOT_BUSY"
    assert node.robot_state == RobotState.FAULT

    # Reset fault
    pos_before_reset = list(node.mapper.get_positions())
    cmd_reset = RobotCommand(
        command_id="cmd-reset-fault",
        sender_id="ui-client",
        timestamp_ns=time.time_ns(),
        type=CommandType.RESET_FAULT,
        payload={},
    )
    reset_res = node.handle_command_payload(cmd_reset.model_dump_json())
    assert node.robot_state == RobotState.IDLE
    assert reset_res.robot_state == RobotState.IDLE
    # Joint positions remain at current position without moving
    assert node.mapper.get_positions() == pos_before_reset
