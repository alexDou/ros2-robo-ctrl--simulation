"""Unit tests for EdgeBridgeNode core telemetry, startup homing, and canned poses.

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

from rclpy.node import Node

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




def test_edge_bridge_canned_poses_dispatch(make_switch_server):
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
        engage = RobotCommand(
            command_id="engage-poses",
            sender_id="test-client",
            timestamp_ns=time.time_ns(),
            type=CommandType.ENGAGE,
            payload={},
        )
        node.handle_command(engage)
        assert node.robot_state == RobotState.IDLE
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
        try:
            _fake.destroy_node()
        except Exception:
            pass
        mock_traj_server.destroy()
        mock_controller.destroy_node()
        node.close()
        node.destroy_node()


def test_edge_bridge_multi_waypoint_preservation(make_switch_server):
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
        engage = RobotCommand(
            command_id="engage-wp",
            sender_id="test-client",
            timestamp_ns=time.time_ns(),
            type=CommandType.ENGAGE,
            payload={},
        )
        node.handle_command(engage)
        assert node.robot_state == RobotState.IDLE
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
        try:
            _fake.destroy_node()
        except Exception:
            pass
        mock_traj_server.destroy()
        mock_controller.destroy_node()
        node.close()
        node.destroy_node()
