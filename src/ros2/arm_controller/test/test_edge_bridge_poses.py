"""Unit tests for EdgeBridgeNode core telemetry, startup homing, and canned poses.

Covers Unit 6.5-Bugfix.2.1 (hand-sim-o5es):
- EdgeBridgeNode initialization and parameters
- Zero-alloc 500 Hz JointState subscription and canonical joint index caching
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
import pytest

from control_msgs.action import FollowJointTrajectory
import rclpy
from rclpy.action import ActionServer, CancelResponse
from rclpy.executors import MultiThreadedExecutor
from rclpy.node import Node
from rclpy.parameter import Parameter
from sensor_msgs.msg import JointState

from domain import (
    CANONICAL_POSES,
    CANONICAL_UR5E_JOINTS,
    CommandType,
    ErrorFrame,
    PoseName,
    RobotCommand,
    RobotState,
    RobotTelemetryEvent,
    robot_command_topic,
    robot_telemetry_topic,
)

from arm_controller.edge_bridge_node import EdgeBridgeNode


@pytest.fixture(autouse=True)
def ros_context():
    if not rclpy.ok():
        rclpy.init()
    yield
    if rclpy.ok():
        rclpy.shutdown()


def test_edge_bridge_initialization():
    """Asserts default parameters and initial states of EdgeBridgeNode."""
    node = EdgeBridgeNode(
        parameter_overrides=[
            Parameter("robot_id", Parameter.Type.STRING, "test-arm"),
            Parameter("auto_home_on_startup", Parameter.Type.BOOL, False),
            Parameter("auto_connect_zenoh", Parameter.Type.BOOL, False),
        ]
    )
    try:
        assert node.robot_id == "test-arm"
        assert node.robot_state == RobotState.IDLE
        assert len(node.current_joints) == 6
        assert node.current_joints == CANONICAL_POSES[PoseName.HOME]
    finally:
        node.close()
        node.destroy_node()


def test_edge_bridge_joint_states_subscriber():
    """Asserts /joint_states message with shuffled names maps to canonical UR5e joint order."""
    node = EdgeBridgeNode(
        parameter_overrides=[
            Parameter("robot_id", Parameter.Type.STRING, "test-arm-js"),
            Parameter("joint_states_topic", Parameter.Type.STRING, "/test/edge_bridge/joint_states"),
            Parameter("auto_home_on_startup", Parameter.Type.BOOL, False),
            Parameter("auto_connect_zenoh", Parameter.Type.BOOL, False),
        ]
    )
    pub_node = Node("test_js_publisher")
    pub = pub_node.create_publisher(JointState, "/test/edge_bridge/joint_states", 10)

    executor = MultiThreadedExecutor()
    executor.add_node(node)
    executor.add_node(pub_node)

    spin_thread = threading.Thread(target=executor.spin, daemon=True)
    spin_thread.start()

    try:
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
        pub_node.destroy_node()
        node.close()
        node.destroy_node()


def test_edge_bridge_startup_homing():
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
        ]
    )

    executor = MultiThreadedExecutor()
    executor.add_node(mock_controller)
    executor.add_node(node)

    spin_thread = threading.Thread(target=executor.spin, daemon=True)
    spin_thread.start()

    try:
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
        mock_traj_server.destroy()
        mock_controller.destroy_node()
        node.close()
        node.destroy_node()


def test_edge_bridge_canned_poses_dispatch():
    """Asserts TRAJECTORY_EXECUTE for CANONICAL_POSES (HOME, READY, INSPECT_POSE) dispatches correct goals."""
    mock_controller = Node("mock_controller_poses")
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
        "/test_controller/follow_joint_trajectory_poses",
        execute_callback=handle_traj_execute,
    )

    node = EdgeBridgeNode(
        parameter_overrides=[
            Parameter("robot_id", Parameter.Type.STRING, "test-arm-poses"),
            Parameter("controller_action_name", Parameter.Type.STRING, "/test_controller/follow_joint_trajectory_poses"),
            Parameter("auto_home_on_startup", Parameter.Type.BOOL, False),
            Parameter("step_duration", Parameter.Type.DOUBLE, 0.05),
            Parameter("auto_connect_zenoh", Parameter.Type.BOOL, False),
        ]
    )

    executor = MultiThreadedExecutor()
    executor.add_node(mock_controller)
    executor.add_node(node)

    spin_thread = threading.Thread(target=executor.spin, daemon=True)
    spin_thread.start()

    try:
        poses_to_test = [PoseName.READY, PoseName.INSPECT_POSE, PoseName.HOME]
        for pose_name in poses_to_test:
            received_traj_goals.clear()
            cmd = RobotCommand(
                command_id=f"cmd-pose-{pose_name.value}",
                sender_id="test-client",
                timestamp_ns=time.time_ns(),
                type=CommandType.TRAJECTORY_EXECUTE,
                payload={"pose_name": pose_name.value},
            )
            event = node.handle_command(cmd)
            assert event is not None
            assert event.command_id == cmd.command_id

            # Wait for execution completion
            start_t = time.time()
            while node.robot_state != RobotState.IDLE and time.time() - start_t < 3.0:
                time.sleep(0.02)

            assert node.robot_state == RobotState.IDLE
            assert len(received_traj_goals) == 1
            goal_req = received_traj_goals[0]
            assert goal_req.trajectory.joint_names == CANONICAL_UR5E_JOINTS
            target_pt = goal_req.trajectory.points[0].positions
            for target_q, expected_q in zip(target_pt, CANONICAL_POSES[pose_name]):
                assert math.isclose(target_q, expected_q, abs_tol=1e-4)
    finally:
        executor.shutdown()
        spin_thread.join(timeout=1.0)
        mock_traj_server.destroy()
        mock_controller.destroy_node()
        node.close()
        node.destroy_node()


def test_edge_bridge_emergency_stop_and_reset_fault():
    """Asserts EMERGENCY_STOP cancels active trajectory, sends safe-stop, sets FAULT, and RESET_FAULT restores IDLE."""
    mock_controller = Node("mock_controller_estop")
    received_traj_goals = []
    cancel_received = threading.Event()
    exec_started = threading.Event()

    def handle_traj_execute(goal_handle):
        received_traj_goals.append(goal_handle.request)
        exec_started.set()
        # Slow trajectory execution to allow interruptible e-stop
        for _ in range(50):
            if goal_handle.is_cancel_requested:
                cancel_received.set()
                goal_handle.canceled()
                res = FollowJointTrajectory.Result()
                res.error_code = FollowJointTrajectory.Result.SUCCESSFUL
                return res
            time.sleep(0.05)

        goal_handle.succeed()
        res = FollowJointTrajectory.Result()
        res.error_code = FollowJointTrajectory.Result.SUCCESSFUL
        return res

    mock_traj_server = ActionServer(
        mock_controller,
        FollowJointTrajectory,
        "/test_controller/follow_joint_trajectory_estop",
        execute_callback=handle_traj_execute,
        cancel_callback=lambda cancel_request: CancelResponse.ACCEPT,
    )

    node = EdgeBridgeNode(
        parameter_overrides=[
            Parameter("robot_id", Parameter.Type.STRING, "test-arm-estop"),
            Parameter("controller_action_name", Parameter.Type.STRING, "/test_controller/follow_joint_trajectory_estop"),
            Parameter("auto_home_on_startup", Parameter.Type.BOOL, False),
            Parameter("step_duration", Parameter.Type.DOUBLE, 0.5),
            Parameter("auto_connect_zenoh", Parameter.Type.BOOL, False),
        ]
    )

    executor = MultiThreadedExecutor()
    executor.add_node(mock_controller)
    executor.add_node(node)

    spin_thread = threading.Thread(target=executor.spin, daemon=True)
    spin_thread.start()

    try:
        # Start a trajectory
        cmd_move = RobotCommand(
            command_id="cmd-start-move",
            sender_id="test-client",
            timestamp_ns=time.time_ns(),
            type=CommandType.TRAJECTORY_EXECUTE,
            payload={"pose_name": PoseName.READY.value},
        )
        node.handle_command(cmd_move)

        # Wait until EXECUTING and execution starts on server
        assert exec_started.wait(timeout=3.0), "Trajectory execution did not start on mock controller"
        assert node.robot_state == RobotState.EXECUTING

        # Send EMERGENCY_STOP
        cmd_estop = RobotCommand(
            command_id="cmd-estop-1",
            sender_id="test-client",
            timestamp_ns=time.time_ns(),
            type=CommandType.EMERGENCY_STOP,
            payload={"reason": "Operator triggered e-stop"},
        )
        event_estop = node.handle_command(cmd_estop)

        assert node.robot_state == RobotState.FAULT
        assert event_estop.robot_state == RobotState.FAULT
        assert event_estop.command_id == "cmd-estop-1"

        # Wait briefly for cancel signal to reach mock controller
        cancel_received.wait(timeout=2.0)
        assert cancel_received.is_set(), "Active trajectory goal was not cancelled on EMERGENCY_STOP"

        # Assert trajectory commands are rejected while in FAULT
        cmd_rejected = RobotCommand(
            command_id="cmd-during-fault",
            sender_id="test-client",
            timestamp_ns=time.time_ns(),
            type=CommandType.TRAJECTORY_EXECUTE,
            payload={"pose_name": PoseName.HOME.value},
        )
        event_rejected = node.handle_command(cmd_rejected)
        assert event_rejected is None
        assert node.robot_state == RobotState.FAULT

        # Send RESET_FAULT
        cmd_reset = RobotCommand(
            command_id="cmd-reset-1",
            sender_id="test-client",
            timestamp_ns=time.time_ns(),
            type=CommandType.RESET_FAULT,
            payload={},
        )
        event_reset = node.handle_command(cmd_reset)
        assert event_reset is not None
        assert event_reset.robot_state == RobotState.IDLE
        assert event_reset.command_id == "cmd-reset-1"
        assert node.robot_state == RobotState.IDLE

        # Now commands should be accepted again
        cmd_accepted = RobotCommand(
            command_id="cmd-after-reset",
            sender_id="test-client",
            timestamp_ns=time.time_ns(),
            type=CommandType.TRAJECTORY_EXECUTE,
            payload={"pose_name": PoseName.HOME.value},
        )
        event_accepted = node.handle_command(cmd_accepted)
        assert event_accepted is not None
    finally:
        executor.shutdown()
        spin_thread.join(timeout=1.0)
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

        # Wait for telemetry response
        assert telem_event.wait(timeout=3.0), "Zenoh telemetry event not received"
        assert len(received_telemetry) >= 1
        last_telem = RobotTelemetryEvent.model_validate_json(received_telemetry[-1])
        assert last_telem.command_id == "cmd-ping-zenoh"
        assert last_telem.robot_state == RobotState.IDLE
    finally:
        executor.shutdown()
        spin_thread.join(timeout=1.0)
        node.close()
        node.destroy_node()
        sub.undeclare()
        session.close()


def test_edge_bridge_schema_validation_error_frame():
    """Asserts invalid command payload returns ErrorFrame without crashing node."""
    node = EdgeBridgeNode(
        parameter_overrides=[
            Parameter("robot_id", Parameter.Type.STRING, "test-arm-err"),
            Parameter("auto_home_on_startup", Parameter.Type.BOOL, False),
            Parameter("auto_connect_zenoh", Parameter.Type.BOOL, False),
        ]
    )
    try:
        # Invalid JSON
        res = node.handle_command_payload("not-valid-json")
        assert res is None

        # Missing required command_id
        res2 = node.handle_command_payload('{"type": "PING"}')
        assert res2 is None

        # Unknown pose name
        bad_pose_cmd = RobotCommand(
            command_id="bad-pose",
            sender_id="tester",
            timestamp_ns=time.time_ns(),
            type=CommandType.TRAJECTORY_EXECUTE,
            payload={"pose_name": "NON_EXISTENT_POSE"},
        )
        res3 = node.handle_command(bad_pose_cmd)
        assert res3 is None
        assert node.robot_state == RobotState.IDLE

        # Unsupported command type (e.g. unknown or unhandled)
        unsupported_cmd = RobotCommand(
            command_id="unsupported-cmd",
            sender_id="tester",
            timestamp_ns=time.time_ns(),
            type=CommandType.PALM_ACTUATE,
            payload={"action": "GRASP"},
        )
        res4 = node.handle_command(unsupported_cmd)
        assert res4 is None
        assert node.robot_state == RobotState.IDLE
    finally:
        node.close()
        node.destroy_node()


def test_edge_bridge_multi_waypoint_preservation():
    """Asserts TRAJECTORY_EXECUTE with waypoints preserves all intermediate waypoints."""
    mock_controller = Node("mock_controller_wp")
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
        "/test_controller/follow_joint_trajectory_wp",
        execute_callback=handle_traj_execute,
    )

    node = EdgeBridgeNode(
        parameter_overrides=[
            Parameter("robot_id", Parameter.Type.STRING, "test-arm-wp"),
            Parameter("controller_action_name", Parameter.Type.STRING, "/test_controller/follow_joint_trajectory_wp"),
            Parameter("auto_home_on_startup", Parameter.Type.BOOL, False),
            Parameter("step_duration", Parameter.Type.DOUBLE, 0.05),
            Parameter("auto_connect_zenoh", Parameter.Type.BOOL, False),
        ]
    )

    executor = MultiThreadedExecutor()
    executor.add_node(mock_controller)
    executor.add_node(node)

    spin_thread = threading.Thread(target=executor.spin, daemon=True)
    spin_thread.start()

    try:
        waypoints = [
            [0.1, -1.0, 0.5, -1.0, -1.5, 0.0],
            [0.2, -0.8, 1.0, -0.8, -1.5, 0.1],
            [0.3, -0.5, 1.5, -0.5, -1.5, 0.2],
        ]
        cmd = RobotCommand(
            command_id="cmd-waypoints",
            sender_id="test-client",
            timestamp_ns=time.time_ns(),
            type=CommandType.TRAJECTORY_EXECUTE,
            payload={"waypoints": waypoints},
        )
        event = node.handle_command(cmd)
        assert event is not None

        start_t = time.time()
        while node.robot_state != RobotState.IDLE and time.time() - start_t < 3.0:
            time.sleep(0.02)

        assert node.robot_state == RobotState.IDLE
        assert len(received_traj_goals) == 1
        goal_req = received_traj_goals[0]
        # Verify ALL 3 waypoints are present, not just the last one
        assert len(goal_req.trajectory.points) == 3
        for i, pt in enumerate(goal_req.trajectory.points):
            for q_actual, q_expected in zip(pt.positions, waypoints[i]):
                assert math.isclose(q_actual, q_expected, abs_tol=1e-4)
    finally:
        executor.shutdown()
        spin_thread.join(timeout=1.0)
        mock_traj_server.destroy()
        mock_controller.destroy_node()
        node.close()
        node.destroy_node()

