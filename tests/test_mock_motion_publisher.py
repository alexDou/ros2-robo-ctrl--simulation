"""Unit tests for MockMotionPublisher (Unit 3.1: hand-sim-ihmn)."""

import math
import time
from unittest.mock import MagicMock
import pytest

from domain import (
    CANONICAL_UR5E_JOINTS,
    RobotState,
    RobotTelemetryEvent,
    robot_telemetry_topic,
)


@pytest.fixture
def mock_ros_node():
    mock = MagicMock()
    mock.get_logger.return_value = MagicMock()
    clock_mock = MagicMock()
    clock_mock.now.return_value.nanoseconds = 1700000000000000000
    now_msg = MagicMock()
    now_msg.sec = 1700000000
    now_msg.nanosec = 0
    clock_mock.now.return_value.to_msg.return_value = now_msg
    mock.get_clock.return_value = clock_mock
    mock.create_publisher.return_value = MagicMock()
    return mock


def test_mock_motion_publisher_trajectory_generation(mock_ros_node):
    from edge_node.mock_motion_publisher import MockMotionPublisher

    pub = MockMotionPublisher(robot_id="test-robot", ros2_node=mock_ros_node, enable_zenoh=False)

    # 1. Verify 6 canonical UR5e joints are configured
    assert len(pub.joint_configs) == 6
    assert [cfg.name for cfg in pub.joint_configs] == list(CANONICAL_UR5E_JOINTS)

    # 2. Verify each joint oscillates with distinct frequency, amplitude, and phase offset
    freqs = [cfg.frequency_hz for cfg in pub.joint_configs]
    amplitudes = [cfg.amplitude for cfg in pub.joint_configs]
    phases = [cfg.phase_offset for cfg in pub.joint_configs]

    assert len(set(freqs)) == 6, "Each joint must have a distinct frequency"
    assert len(set(amplitudes)) == 6, "Each joint must have a distinct amplitude"
    assert len(set(phases)) == 6, "Each joint must have a distinct phase offset"

    # Frequencies must be non-harmonic (no pair where f_j = k * f_i for integer k > 1)
    for i in range(len(freqs)):
        for j in range(len(freqs)):
            if i != j:
                ratio = freqs[i] / freqs[j]
                assert not (abs(ratio - round(ratio)) < 1e-6 and round(ratio) > 1), (
                    f"Frequencies {freqs[i]} and {freqs[j]} are harmonic multiples"
                )


def test_mock_motion_publisher_physical_limits_bounded(mock_ros_node):
    from edge_node.mock_motion_publisher import MockMotionPublisher

    pub = MockMotionPublisher(robot_id="test-robot", ros2_node=mock_ros_node, enable_zenoh=False)

    # Simulate 30 Hz for 100 seconds (3000 ticks)
    dt = 1.0 / 30.0
    for step in range(3000):
        t = step * dt
        positions = pub.calculate_joint_positions(t)
        velocities = pub.calculate_joint_velocities(t)

        assert len(positions) == 6
        assert len(velocities) == 6

        for i, pos in enumerate(positions):
            assert not math.isnan(pos), f"NaN at t={t} joint {i}"
            assert not math.isinf(pos), f"Inf at t={t} joint {i}"
            # Strictly bounded within [-pi, pi]
            assert -math.pi <= pos <= math.pi, (
                f"Position {pos} out of physical limits [-pi, pi] at t={t} for joint {pub.joint_configs[i].name}"
            )


def test_mock_motion_publisher_joint_state_message(mock_ros_node):
    from sensor_msgs.msg import JointState
    from edge_node.mock_motion_publisher import MockMotionPublisher

    pub = MockMotionPublisher(robot_id="test-robot", ros2_node=mock_ros_node, enable_zenoh=False)

    msg = pub.create_joint_state_msg(t=1.0)
    assert isinstance(msg, JointState)
    assert msg.name == list(CANONICAL_UR5E_JOINTS)
    assert len(msg.position) == 6
    assert len(msg.velocity) == 6
    assert len(msg.effort) == 6
    assert msg.header.frame_id == "base_link"
    assert msg.header.stamp.sec == 1700000000


def test_mock_motion_publisher_telemetry_event_schema(mock_ros_node):
    from edge_node.mock_motion_publisher import MockMotionPublisher

    pub = MockMotionPublisher(robot_id="test-robot", ros2_node=mock_ros_node, enable_zenoh=False)

    event = pub.create_telemetry_event(t=2.5)
    assert isinstance(event, RobotTelemetryEvent)
    assert event.timestamp_ns == 1700000000000000000
    assert event.robot_state in (RobotState.IDLE, RobotState.EXECUTING)
    assert len(event.joint_positions) == 6
    for pos in event.joint_positions:
        assert -math.pi <= pos <= math.pi

    # Validate JSON serializability according to schema contract
    serialized = event.model_dump_json()
    reparsed = RobotTelemetryEvent.model_validate_json(serialized)
    assert reparsed.timestamp_ns == event.timestamp_ns
    assert reparsed.joint_positions == event.joint_positions


def test_mock_motion_publisher_cadence_and_zero_order_hold(mock_ros_node):
    import pytest
    from edge_node.mock_motion_publisher import MockMotionPublisher

    pub = MockMotionPublisher(
        robot_id="test-robot",
        rate_hz=30.0,
        ros2_node=mock_ros_node,
        enable_zenoh=False,
    )

    assert pub.period == pytest.approx(1.0 / 30.0, rel=1e-5)

    # Initial tick
    msg1, ev1 = pub.publish_tick(t=0.0)
    # Consecutive tick with exact same timestamp (zero-order hold)
    pos_held = pub.get_current_positions()
    assert pos_held == list(msg1.position)

    # Advance by dt
    msg2, ev2 = pub.publish_tick(t=1.0 / 30.0)
    assert list(msg2.position) != list(msg1.position)
    assert pub.get_current_positions() == list(msg2.position)


def test_mock_motion_publisher_zenoh_and_ros_publication(mock_ros_node):
    import zenoh
    from edge_node.mock_motion_publisher import MockMotionPublisher

    robot_id = "test-mock-motion-zenoh"
    client_session = zenoh.open(zenoh.Config())
    received_telemetry = []

    sub = client_session.declare_subscriber(
        robot_telemetry_topic(robot_id),
        lambda sample: received_telemetry.append(bytes(sample.payload).decode("utf-8")),
    )
    time.sleep(0.1)

    pub = MockMotionPublisher(
        robot_id=robot_id,
        rate_hz=30.0,
        ros2_node=mock_ros_node,
        enable_zenoh=True,
    )

    try:
        msg, event = pub.publish_tick(t=0.5)

        # ROS2 publisher verify
        pub.ros_publisher.publish.assert_called_with(msg)

        # Zenoh publisher verify
        deadline = time.time() + 1.0
        while time.time() < deadline and not received_telemetry:
            time.sleep(0.05)

        assert len(received_telemetry) >= 1
        received_obj = RobotTelemetryEvent.model_validate_json(received_telemetry[0])
        assert received_obj.joint_positions == list(msg.position)
        assert received_obj.timestamp_ns == event.timestamp_ns
    finally:
        pub.close()
        client_session.close()


def test_mock_motion_publisher_cli_defaults_and_flags(monkeypatch):
    from edge_node.mock_motion_publisher import build_arg_parser

    # Clean environment
    monkeypatch.delenv("ENABLE_ZENOH", raising=False)

    # 1. Default should disable Zenoh (prevent split-brain with EdgeNode)
    parser = build_arg_parser()
    args = parser.parse_args([])
    assert args.enable_zenoh is False

    # 2. Explicit --zenoh enables standalone Zenoh streaming
    args = parser.parse_args(["--zenoh"])
    assert args.enable_zenoh is True

    # 3. Explicit --no-zenoh flag
    args = parser.parse_args(["--no-zenoh"])
    assert args.enable_zenoh is False

    # 4. Environment variable ENABLE_ZENOH="1"
    monkeypatch.setenv("ENABLE_ZENOH", "1")
    parser = build_arg_parser()
    args = parser.parse_args([])
    assert args.enable_zenoh is True

    # 5. Environment variable ENABLE_ZENOH="0"
    monkeypatch.setenv("ENABLE_ZENOH", "0")
    parser = build_arg_parser()
    args = parser.parse_args([])
    assert args.enable_zenoh is False
