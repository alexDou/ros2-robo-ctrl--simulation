"""EdgeBridgeNode action safety tests (rejection, e-stop, feedback stream)."""

import json
import math
import threading
import time

import rclpy
from rclpy.action import ActionServer, CancelResponse, GoalResponse
from rclpy.executors import MultiThreadedExecutor
from rclpy.node import Node
from rclpy.parameter import Parameter

from domain import (
    CommandType,
    RobotCommand,
    RobotState,
)
from robot_control_interfaces.action import PickAndPlace

from arm_controller.edge_bridge_node import EdgeBridgeNode


def test_edge_bridge_pick_and_place_goal_rejection_fault(make_switch_server):
    """Asserts PickAndPlace goal rejection transitions robot to FAULT state."""
    mock_arm = Node("mock_arm_rejection")

    mock_action_server = ActionServer(
        mock_arm,
        PickAndPlace,
        "/test_arm/pick_and_place_reject",
        execute_callback=lambda gh: PickAndPlace.Result(success=False),
        goal_callback=lambda req: GoalResponse.REJECT,
    )

    node = EdgeBridgeNode(
        parameter_overrides=[
            Parameter("robot_id", Parameter.Type.STRING, "test-pnp-reject"),
            Parameter("pick_and_place_action_name", Parameter.Type.STRING, "/test_arm/pick_and_place_reject"),
            Parameter("auto_home_on_startup", Parameter.Type.BOOL, False),
            Parameter("auto_connect_zenoh", Parameter.Type.BOOL, False),
            Parameter("switch_timeout", Parameter.Type.DOUBLE, 0.1),
        ]
    )

    executor = MultiThreadedExecutor()
    executor.add_node(mock_arm)
    executor.add_node(node)
    _fake = make_switch_server(executor)

    spin_thread = threading.Thread(target=executor.spin, daemon=True)
    spin_thread.start()

    try:
        node.handle_command(
            RobotCommand(
                command_id="engage-pnp-reject",
                sender_id="test-client",
                timestamp_ns=time.time_ns(),
                type=CommandType.ENGAGE,
                payload={},
            )
        )
        cmd = RobotCommand(
            command_id="cmd-pnp-rejected",
            sender_id="test-client",
            timestamp_ns=time.time_ns(),
            type=CommandType.PICK_AND_PLACE_TARGET,
            payload={"pick_x": 0.5, "pick_y": 0.0, "pick_z": 0.0},
        )
        node.handle_command(cmd)

        start_t = time.time()
        while node.robot_state != RobotState.FAULT and time.time() - start_t < 3.0:
            time.sleep(0.02)

        assert node.robot_state == RobotState.FAULT
    finally:
        executor.shutdown()
        spin_thread.join(timeout=1.0)
        try:
            _fake.destroy_node()
        except Exception:
            pass
        mock_action_server.destroy()
        mock_arm.destroy_node()
        node.close()
        node.destroy_node()


def test_edge_bridge_pick_and_place_emergency_stop_cancel(make_switch_server):
    """Asserts EMERGENCY_STOP cancels active PickAndPlace action and sets FAULT."""
    mock_arm = Node("mock_arm_estop_cancel")
    cancel_received = threading.Event()
    exec_started = threading.Event()

    def handle_pnp_execute(goal_handle):
        exec_started.set()
        for _ in range(50):
            if goal_handle.is_cancel_requested:
                cancel_received.set()
                goal_handle.canceled()
                res = PickAndPlace.Result()
                res.success = False
                res.message = "Canceled by estop"
                return res
            time.sleep(0.05)

        goal_handle.succeed()
        return PickAndPlace.Result(success=True)

    mock_action_server = ActionServer(
        mock_arm,
        PickAndPlace,
        "/test_arm/pick_and_place_estop",
        execute_callback=handle_pnp_execute,
        cancel_callback=lambda req: CancelResponse.ACCEPT,
    )

    node = EdgeBridgeNode(
        parameter_overrides=[
            Parameter("robot_id", Parameter.Type.STRING, "test-pnp-estop"),
            Parameter("pick_and_place_action_name", Parameter.Type.STRING, "/test_arm/pick_and_place_estop"),
            Parameter("auto_home_on_startup", Parameter.Type.BOOL, False),
            Parameter("auto_connect_zenoh", Parameter.Type.BOOL, False),
            Parameter("switch_timeout", Parameter.Type.DOUBLE, 0.1),
        ]
    )

    executor = MultiThreadedExecutor()
    executor.add_node(mock_arm)
    executor.add_node(node)
    _fake = make_switch_server(executor)

    spin_thread = threading.Thread(target=executor.spin, daemon=True)
    spin_thread.start()

    try:
        node.handle_command(
            RobotCommand(
                command_id="engage-pnp-abort",
                sender_id="test-client",
                timestamp_ns=time.time_ns(),
                type=CommandType.ENGAGE,
                payload={},
            )
        )
        cmd = RobotCommand(
            command_id="cmd-pnp-to-abort",
            sender_id="test-client",
            timestamp_ns=time.time_ns(),
            type=CommandType.PICK_AND_PLACE_TARGET,
            payload={"pick_x": 0.45, "pick_y": 0.1, "pick_z": 0.0},
        )
        node.handle_command(cmd)

        assert exec_started.wait(timeout=3.0)
        assert node.robot_state == RobotState.EXECUTING

        cmd_estop = RobotCommand(
            command_id="cmd-estop-pnp",
            sender_id="test-client",
            timestamp_ns=time.time_ns(),
            type=CommandType.EMERGENCY_STOP,
            payload={},
        )
        node.handle_command(cmd_estop)

        assert node.robot_state == RobotState.FAULT
        assert cancel_received.wait(timeout=2.0)
    finally:
        executor.shutdown()
        spin_thread.join(timeout=1.0)
        try:
            _fake.destroy_node()
        except Exception:
            pass
        mock_action_server.destroy()
        mock_arm.destroy_node()
        node.close()
        node.destroy_node()


def test_edge_bridge_zenoh_action_feedback_streaming(make_switch_server):
    """Asserts EdgeBridgeNode streams ActionFeedbackFrame to Zenoh feedback topic."""
    import zenoh

    session = zenoh.open(zenoh.Config())
    robot_id = "test-arm-zenoh-fb"
    feedback_topic = "rt/arm_controller/pick_and_place/_action/feedback"

    received_feedback = []
    fb_event = threading.Event()

    def on_feedback_sample(sample):
        try:
            raw = sample.payload.to_bytes().decode("utf-8")
            data = json.loads(raw)
            received_feedback.append(data)
            fb_event.set()
        except Exception:
            pass

    sub = session.declare_subscriber(feedback_topic, on_feedback_sample)

    mock_arm = Node("mock_arm_zenoh_fb")

    def handle_pnp_execute(goal_handle):
        fb = PickAndPlace.Feedback()
        fb.phase = "GRASPING"
        fb.percent_complete = 30.0
        goal_handle.publish_feedback(fb)
        time.sleep(0.05)
        goal_handle.succeed()
        return PickAndPlace.Result(success=True)

    mock_server = ActionServer(
        mock_arm,
        PickAndPlace,
        "/test_zenoh/pick_and_place",
        execute_callback=handle_pnp_execute,
    )

    node = EdgeBridgeNode(
        parameter_overrides=[
            Parameter("robot_id", Parameter.Type.STRING, robot_id),
            Parameter("pick_and_place_action_name", Parameter.Type.STRING, "/test_zenoh/pick_and_place"),
            Parameter("action_feedback_topic", Parameter.Type.STRING, feedback_topic),
            Parameter("auto_home_on_startup", Parameter.Type.BOOL, False),
            Parameter("auto_connect_zenoh", Parameter.Type.BOOL, False),
            Parameter("switch_timeout", Parameter.Type.DOUBLE, 0.1),
        ],
        zenoh_session=session,
    )

    executor = MultiThreadedExecutor()
    executor.add_node(mock_arm)
    executor.add_node(node)
    _fake = make_switch_server(executor)

    spin_thread = threading.Thread(target=executor.spin, daemon=True)
    spin_thread.start()

    try:
        node.handle_command(
            RobotCommand(
                command_id="engage-zenoh-fb",
                sender_id="ui-client",
                timestamp_ns=time.time_ns(),
                type=CommandType.ENGAGE,
                payload={},
            )
        )
        cmd = RobotCommand(
            command_id="cmd-zenoh-pnp",
            sender_id="ui-client",
            timestamp_ns=time.time_ns(),
            type=CommandType.PICK_AND_PLACE_TARGET,
            payload={"pick_x": 0.45, "pick_y": 0.10, "pick_z": 0.0},
        )
        node.handle_command(cmd)

        assert fb_event.wait(timeout=3.0), "Action feedback not received over Zenoh"
        assert len(received_feedback) >= 1
        fb_frame = received_feedback[0]
        assert fb_frame.get("type") == "ACTION_FEEDBACK"
        assert fb_frame.get("command_id") == "cmd-zenoh-pnp"
        assert fb_frame.get("phase") == "GRASPING"
        assert math.isclose(fb_frame.get("percent_complete", 0.0), 30.0, abs_tol=1e-2)

        start_t = time.time()
        while node.robot_state != RobotState.IDLE and time.time() - start_t < 3.0:
            time.sleep(0.02)
    finally:
        executor.shutdown()
        spin_thread.join(timeout=1.0)
        try:
            _fake.destroy_node()
        except Exception:
            pass
        mock_server.destroy()
        mock_arm.destroy_node()
        node.close()
        node.destroy_node()
        sub.undeclare()
        session.close()
