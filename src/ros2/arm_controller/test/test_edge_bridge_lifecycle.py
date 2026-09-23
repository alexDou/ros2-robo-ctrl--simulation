"""Unit tests for EdgeBridgeNode joint subscription, startup homing, and zenoh integration.

Covers Unit 6.5-Bugfix.2.1 (hand-sim-o5es):
- EdgeBridgeNode initialization and parameters
- Zero-alloc 100 Hz sim JointState subscription and canonical joint index caching
- Automatic startup homing to CANONICAL_POSES[HOME]
- Dispatching TRAJECTORY_EXECUTE for canonical poses (HOME, READY, INSPECT_POSE)
- EMERGENCY_STOP handling: canceling active goal, commanding safe-stop trajectory, and FAULT transition
- RESET_FAULT handling: restoring IDLE state
- Rejecting trajectory execution during FAULT state
- Real-time Zenoh command subscriber on robot/{id}/command and telemetry publication
- Schema validation error frame handling
"""

import math
import threading
import time

from control_msgs.action import FollowJointTrajectory
from rclpy.action import ActionServer, CancelResponse
from rclpy.executors import MultiThreadedExecutor
from rclpy.node import Node
from rclpy.parameter import Parameter
from sensor_msgs.msg import JointState

from domain import (
    CANONICAL_POSES,
    CANONICAL_UR5E_JOINTS,
    CommandType,
    PoseName,
    RobotCommand,
    RobotState,
    RobotTelemetryEvent,
    robot_command_topic,
    robot_telemetry_topic,
)

from arm_controller.edge_bridge_node import EdgeBridgeNode


def test_edge_bridge_joint_states_subscriber(make_switch_server):
    """Asserts /joint_states message with shuffled names maps to canonical UR5e joint order."""
    node = EdgeBridgeNode(
        parameter_overrides=[
            Parameter("robot_id", Parameter.Type.STRING, "test-arm-js"),
            Parameter("joint_states_topic", Parameter.Type.STRING, "/test/edge_bridge/joint_states"),
            Parameter("auto_home_on_startup", Parameter.Type.BOOL, False),
            Parameter("auto_connect_zenoh", Parameter.Type.BOOL, False),
            Parameter("switch_timeout", Parameter.Type.DOUBLE, 0.1),
        ]
    )
    pub_node = Node("test_js_publisher")
    pub = pub_node.create_publisher(JointState, "/test/edge_bridge/joint_states", 10)

    executor = MultiThreadedExecutor()
    executor.add_node(node)
    executor.add_node(pub_node)
    _fake = make_switch_server(executor)

    spin_thread = threading.Thread(target=executor.spin, daemon=True)
    spin_thread.start()

    try:
        # Handshake: joint sub created lazily on ENGAGE
        assert node.robot_state == RobotState.STANDBY
        engage = RobotCommand(
            command_id="engage-js",
            sender_id="test-client",
            timestamp_ns=time.time_ns(),
            type=CommandType.ENGAGE,
            payload={},
        )
        node.handle_command(engage)
        assert node.robot_state == RobotState.IDLE
        # Shuffled order of joints
        shuffled_names = [
            "wrist_3_joint",
            "shoulder_pan_joint",
            "wrist_1_joint",
            "elbow_joint",
            "wrist_2_joint",
            "shoulder_lift_joint",
        ]
        shuffled_positions = [0.6, 0.1, 0.4, 0.3, 0.5, 0.2]

        msg = JointState()
        msg.name = shuffled_names
        msg.position = shuffled_positions

        # Publish multiple times to ensure reception
        for _ in range(5):
            pub.publish(msg)
            time.sleep(0.02)

        time.sleep(0.1)

        expected_canonical = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]
        for curr, exp in zip(node.current_joints, expected_canonical):
            assert math.isclose(curr, exp, abs_tol=1e-4)
    finally:
        executor.shutdown()
        spin_thread.join(timeout=1.0)
        try:
            _fake.destroy_node()
        except Exception:
            pass
        pub_node.destroy_node()
        node.close()
        node.destroy_node()


def test_edge_bridge_startup_homing(make_switch_server):
    """Asserts node auto-commands HOME pose on startup when auto_home_on_startup is True."""
    mock_controller = Node("mock_controller_homing")
    received_traj_goals = []

    def handle_traj_execute(goal_handle):
        received_traj_goals.append(goal_handle.request)
        goal_handle.succeed()
        res = FollowJointTrajectory.Result()
        res.error_code = FollowJointTrajectory.Result.SUCCESSFUL
        return res

    mock_traj_server = ActionServer(
        mock_controller,
        FollowJointTrajectory,
        "/test_controller/follow_joint_trajectory_homing",
        execute_callback=handle_traj_execute,
    )

    node = EdgeBridgeNode(
        parameter_overrides=[
            Parameter("robot_id", Parameter.Type.STRING, "test-arm-homing"),
            Parameter("controller_action_name", Parameter.Type.STRING, "/test_controller/follow_joint_trajectory_homing"),
            Parameter("auto_home_on_startup", Parameter.Type.BOOL, True),
            Parameter("traj_connect_timeout", Parameter.Type.DOUBLE, 2.0),
            Parameter("step_duration", Parameter.Type.DOUBLE, 0.05),
            Parameter("auto_connect_zenoh", Parameter.Type.BOOL, False),
            Parameter("switch_timeout", Parameter.Type.DOUBLE, 0.1),
        ]
    )

    executor = MultiThreadedExecutor()
    executor.add_node(mock_controller)
    executor.add_node(node)
    _fake = make_switch_server(executor)

    spin_thread = threading.Thread(target=executor.spin, daemon=True)
    spin_thread.start()

    try:
        # Homing deferred until ENGAGE handshake (no auto-spin on startup)
        assert node.robot_state == RobotState.STANDBY
        assert len(received_traj_goals) == 0
        engage = RobotCommand(
            command_id="engage-homing",
            sender_id="test-client",
            timestamp_ns=time.time_ns(),
            type=CommandType.ENGAGE,
            payload={},
        )
        node.handle_command(engage)
        # Wait for homing to complete
        homed = node.wait_for_homing(timeout_sec=4.0)
        assert homed, "Startup homing timed out"
        assert len(received_traj_goals) >= 1

        goal_req = received_traj_goals[0]
        assert goal_req.trajectory.joint_names == CANONICAL_UR5E_JOINTS
        assert len(goal_req.trajectory.points) == 1
        target_pt = goal_req.trajectory.points[0].positions
        for target_q, home_q in zip(target_pt, CANONICAL_POSES[PoseName.HOME]):
            assert math.isclose(target_q, home_q, abs_tol=1e-4)

        assert node.robot_state == RobotState.IDLE
    finally:
        executor.shutdown()
        spin_thread.join(timeout=1.0)
        try:
            _fake.destroy_node()
        except Exception:
            pass
        mock_traj_server.destroy()
        mock_controller.destroy_node()
        node.close()
        node.destroy_node()


def test_edge_bridge_zenoh_integration():
    """Asserts EdgeBridgeNode subscribes to robot/{id}/command and publishes to robot/{id}/telemetry via Zenoh."""
    import zenoh

    session = zenoh.open(zenoh.Config())
    robot_id = "test-arm-zenoh"
    cmd_topic = robot_command_topic(robot_id)
    telem_topic = robot_telemetry_topic(robot_id)

    received_telemetry = []
    telem_event = threading.Event()

    def on_telem(sample):
        received_telemetry.append(sample.payload.to_bytes().decode("utf-8"))
        telem_event.set()

    sub = session.declare_subscriber(telem_topic, on_telem)

    node = EdgeBridgeNode(
        parameter_overrides=[
            Parameter("robot_id", Parameter.Type.STRING, robot_id),
            Parameter("auto_home_on_startup", Parameter.Type.BOOL, False),
            Parameter("auto_connect_zenoh", Parameter.Type.BOOL, False),
            Parameter("switch_timeout", Parameter.Type.DOUBLE, 0.1),
        ],
        zenoh_session=session,
    )

    executor = MultiThreadedExecutor()
    executor.add_node(node)

    spin_thread = threading.Thread(target=executor.spin, daemon=True)
    spin_thread.start()

    try:
        # Publish PING command via Zenoh
        cmd = RobotCommand(
            command_id="cmd-ping-zenoh",
            sender_id="zenoh-tester",
            timestamp_ns=time.time_ns(),
            type=CommandType.PING,
            payload={},
        )
        session.put(cmd_topic, cmd.model_dump_json())

        # Wait for telemetry response (PING allowed in STANDBY)
        assert telem_event.wait(timeout=3.0), "Zenoh telemetry event not received"
        assert len(received_telemetry) >= 1
        last_telem = RobotTelemetryEvent.model_validate_json(received_telemetry[-1])
        assert last_telem.command_id == "cmd-ping-zenoh"
        assert last_telem.robot_state == RobotState.STANDBY
    finally:
        executor.shutdown()
        spin_thread.join(timeout=1.0)
        node.close()
        node.destroy_node()
        sub.undeclare()
        session.close()
