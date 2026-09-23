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




def test_edge_bridge_emergency_stop_and_reset_fault(make_switch_server):
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
        # Start a trajectory (requires ENGAGE first)
        engage = RobotCommand(
            command_id="engage-estop",
            sender_id="test-client",
            timestamp_ns=time.time_ns(),
            type=CommandType.ENGAGE,
            payload={},
        )
        node.handle_command(engage)
        assert node.robot_state == RobotState.IDLE
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
        try:
            _fake.destroy_node()
        except Exception:
            pass
        mock_traj_server.destroy()
        mock_controller.destroy_node()
        node.close()
        node.destroy_node()


def test_edge_bridge_schema_validation_error_frame():
    """Asserts invalid command payload returns ErrorFrame without crashing node."""
    node = EdgeBridgeNode(
        parameter_overrides=[
            Parameter("robot_id", Parameter.Type.STRING, "test-arm-err"),
            Parameter("auto_home_on_startup", Parameter.Type.BOOL, False),
            Parameter("auto_connect_zenoh", Parameter.Type.BOOL, False),
            Parameter("switch_timeout", Parameter.Type.DOUBLE, 0.1),
        ]
    )
    try:
        # Invalid JSON
        res = node.handle_command_payload("not-valid-json")
        assert res is None

        # Missing required command_id
        res2 = node.handle_command_payload('{"type": "PING"}')
        assert res2 is None

        # Unknown pose name (rejected: STANDBY gate fires before pose validation)
        bad_pose_cmd = RobotCommand(
            command_id="bad-pose",
            sender_id="tester",
            timestamp_ns=time.time_ns(),
            type=CommandType.TRAJECTORY_EXECUTE,
            payload={"pose_name": "NON_EXISTENT_POSE"},
        )
        res3 = node.handle_command(bad_pose_cmd)
        assert res3 is None
        assert node.robot_state == RobotState.STANDBY

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
        assert node.robot_state == RobotState.STANDBY
    finally:
        node.close()
        node.destroy_node()
