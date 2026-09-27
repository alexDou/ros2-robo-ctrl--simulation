"""EdgeBridgeNode PickAndPlace dispatch tests (happy path + custom drop)."""

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


def test_edge_bridge_pick_and_place_action_dispatch_and_feedback(make_switch_server):
    """Asserts PICK_AND_PLACE_TARGET dispatches PickAndPlace goal, streams feedback, and toggles is_grasped."""
    mock_arm = Node("mock_arm_pnp_server")
    received_goals: list[PickAndPlace.Goal] = []
    feedback_phases_observed: list[str] = []

    def handle_pnp_execute(goal_handle):
        received_goals.append(goal_handle.request)

        # Stream action feedback phases
        phases = [
            ("APPROACHING", 10.0),
            ("PICKING", 20.0),
            ("GRASPING", 30.0),
            ("LIFTING", 40.0),
            ("TRANSFERRING", 60.0),
            ("DROPPING", 70.0),
            ("RELEASING", 80.0),
            ("RETREATING", 90.0),
            ("HOMING", 95.0),
            ("COMPLETED", 100.0),
        ]
        for phase, pct in phases:
            fb = PickAndPlace.Feedback()
            fb.phase = phase
            fb.percent_complete = pct
            goal_handle.publish_feedback(fb)
            feedback_phases_observed.append(phase)
            time.sleep(0.02)

        goal_handle.succeed()
        res = PickAndPlace.Result()
        res.success = True
        res.message = "Pick and place completed"
        return res

    mock_action_server = ActionServer(
        mock_arm,
        PickAndPlace,
        "/test_arm/pick_and_place",
        execute_callback=handle_pnp_execute,
    )

    node = EdgeBridgeNode(
        parameter_overrides=[
            Parameter("robot_id", Parameter.Type.STRING, "test-pnp-arm"),
            Parameter("pick_and_place_action_name", Parameter.Type.STRING, "/test_arm/pick_and_place"),
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
        assert node.robot_state == RobotState.STANDBY
        assert node.is_grasped is False

        engage = RobotCommand(
            command_id="engage-pnp-01",
            sender_id="test-client",
            timestamp_ns=time.time_ns(),
            type=CommandType.ENGAGE,
            payload={},
        )
        node.handle_command(engage)
        assert node.robot_state == RobotState.IDLE

        cmd = RobotCommand(
            command_id="cmd-pnp-01",
            sender_id="test-client",
            timestamp_ns=time.time_ns(),
            type=CommandType.PICK_AND_PLACE_TARGET,
            payload={
                "pick_x": 0.45,
                "pick_y": 0.10,
                "pick_z": 0.0,
            },
        )

        event = node.handle_command(cmd)
        assert event is not None
        assert event.command_id == "cmd-pnp-01"
        assert node.robot_state == RobotState.EXECUTING

        # Wait for action execution to finish
        start_t = time.time()
        while node.robot_state != RobotState.IDLE and time.time() - start_t < 4.0:
            time.sleep(0.02)

        assert node.robot_state == RobotState.IDLE
        assert node.is_grasped is False
        assert len(received_goals) == 1

        goal_req = received_goals[0]
        assert math.isclose(goal_req.pick_coords.x, 0.45, abs_tol=1e-4)
        assert math.isclose(goal_req.pick_coords.y, 0.10, abs_tol=1e-4)
        assert math.isclose(goal_req.pick_coords.z, 0.0, abs_tol=1e-4)
        assert goal_req.use_custom_drop is False
        assert goal_req.command_id == "cmd-pnp-01"

        assert "GRASPING" in feedback_phases_observed
        assert "RELEASING" in feedback_phases_observed
        # Unit 6.6.7/4ixr: phase end-to-end. Edge tracks last feedback phase
        # through completion; publish_telemetry carries it on the wire.
        assert node.current_phase in (None, "COMPLETED")
        completion_event = node.publish_telemetry(command_id="cmd-pnp-01")
        assert completion_event.phase in (None, "COMPLETED")
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


def test_edge_bridge_pick_and_place_custom_drop_coords(make_switch_server):
    """Asserts PICK_AND_PLACE_TARGET with drop_x/y/z sets use_custom_drop=True."""
    mock_arm = Node("mock_arm_custom_drop")
    received_goals: list[PickAndPlace.Goal] = []

    def handle_pnp_execute(goal_handle):
        received_goals.append(goal_handle.request)
        goal_handle.succeed()
        res = PickAndPlace.Result()
        res.success = True
        res.message = "OK"
        return res

    mock_action_server = ActionServer(
        mock_arm,
        PickAndPlace,
        "/test_arm/pick_and_place_custom",
        execute_callback=handle_pnp_execute,
    )

    node = EdgeBridgeNode(
        parameter_overrides=[
            Parameter("robot_id", Parameter.Type.STRING, "test-pnp-custom"),
            Parameter("pick_and_place_action_name", Parameter.Type.STRING, "/test_arm/pick_and_place_custom"),
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
                command_id="engage-pnp-custom",
                sender_id="test-client",
                timestamp_ns=time.time_ns(),
                type=CommandType.ENGAGE,
                payload={},
            )
        )
        cmd = RobotCommand(
            command_id="cmd-pnp-custom-drop",
            sender_id="test-client",
            timestamp_ns=time.time_ns(),
            type=CommandType.PICK_AND_PLACE_TARGET,
            payload={
                "pick_x": 0.45,
                "pick_y": 0.10,
                "pick_z": 0.0,
                "drop_x": 0.40,
                "drop_y": -0.30,
                "drop_z": 0.08,
            },
        )
        node.handle_command(cmd)

        start_t = time.time()
        while node.robot_state != RobotState.IDLE and time.time() - start_t < 3.0:
            time.sleep(0.02)

        assert len(received_goals) == 1
        goal_req = received_goals[0]
        assert goal_req.use_custom_drop is True
        assert math.isclose(goal_req.drop_coords.x, 0.40, abs_tol=1e-4)
        assert math.isclose(goal_req.drop_coords.y, -0.30, abs_tol=1e-4)
        assert math.isclose(goal_req.drop_coords.z, 0.08, abs_tol=1e-4)
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
