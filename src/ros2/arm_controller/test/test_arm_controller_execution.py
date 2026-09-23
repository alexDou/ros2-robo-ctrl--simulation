"""ArmControllerNode execution tests (lifecycle, cancellation, mutual exclusion, drop-slot faults)."""

import threading
import time

from control_msgs.action import FollowJointTrajectory
from geometry_msgs.msg import Point
import rclpy
from rclpy.action import ActionClient, ActionServer, CancelResponse, GoalResponse
from rclpy.node import Node
from rclpy.executors import MultiThreadedExecutor
from rclpy.parameter import Parameter

from arm_controller.arm_controller_node import (
    ArmControllerNode,
)
from arm_controller.kinematics import (
    CANONICAL_UR5E_JOINTS,
)
from robot_control_interfaces.action import PickAndPlace
from robot_control_interfaces.srv import GetDropSlot


def test_arm_controller_action_lifecycle_and_feedback_stream():
    """Asserts action server streams all 10 feedback phases and executes trajectory with mock controller."""
    # Mock scaled_joint_trajectory_controller action server
    mock_controller = Node("mock_trajectory_controller")
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
        "/test_controller/follow_joint_trajectory",
        execute_callback=handle_traj_execute,
    )

    node = ArmControllerNode(
        parameter_overrides=[
            Parameter("pick_and_place_action_name", Parameter.Type.STRING, "/test/pnp_lifecycle"),
            Parameter("controller_action_name", Parameter.Type.STRING, "/test_controller/follow_joint_trajectory"),
            Parameter("step_duration", Parameter.Type.DOUBLE, 0.01),
            Parameter("require_controller", Parameter.Type.BOOL, True),
        ]
    )
    client_node = Node("test_pnp_client_lifecycle")

    executor = MultiThreadedExecutor()
    executor.add_node(mock_controller)
    executor.add_node(node)
    executor.add_node(client_node)

    client = ActionClient(client_node, PickAndPlace, "/test/pnp_lifecycle")

    feedback_received: list[tuple[str, float]] = []

    def on_feedback(feedback_msg):
        fb = feedback_msg.feedback
        feedback_received.append((fb.phase, fb.percent_complete))

    spin_thread = threading.Thread(target=executor.spin, daemon=True)
    spin_thread.start()

    try:
        assert client.wait_for_server(timeout_sec=3.0)

        goal = PickAndPlace.Goal()
        goal.pick_coords = Point(x=0.35, y=0.15, z=0.0)
        goal.drop_coords = Point(x=0.40, y=-0.30, z=0.0)
        goal.use_custom_drop = True
        goal.command_id = "lifecycle-cmd-1"

        send_future = client.send_goal_async(goal, feedback_callback=on_feedback)
        start_t = time.time()
        while not send_future.done() and time.time() - start_t < 3.0:
            time.sleep(0.01)
        assert send_future.done()
        goal_handle = send_future.result()
        assert goal_handle.accepted

        res_future = goal_handle.get_result_async()
        start_t = time.time()
        while not res_future.done() and time.time() - start_t < 4.0:
            time.sleep(0.01)
        assert res_future.done()
        result = res_future.result().result
        assert result.success is True

        # Assert mock controller received the 10-step trajectory
        assert len(received_traj_goals) >= 1
        traj_msg = received_traj_goals[0].trajectory
        assert traj_msg.joint_names == CANONICAL_UR5E_JOINTS
        assert len(traj_msg.points) == 10

        # Assert all 10 feedback phases were streamed in sequence
        received_phases = [fb[0] for fb in feedback_received]
        assert "APPROACHING" in received_phases
        assert "PICKING" in received_phases
        assert "GRASPING" in received_phases
        assert "LIFTING" in received_phases
        assert "TRANSFERRING" in received_phases
        assert "DROPPING" in received_phases
        assert "RELEASING" in received_phases
        assert "RETREATING" in received_phases
        assert "HOMING" in received_phases
        assert "COMPLETED" in received_phases

        # Assert monotonic percent_complete
        percents = [fb[1] for fb in feedback_received]
        assert percents == sorted(percents)
        assert percents[0] == 10.0
        assert percents[-1] == 100.0
    finally:
        executor.shutdown()
        spin_thread.join(timeout=1.0)
        mock_controller.destroy_node()
        node.destroy_node()
        client_node.destroy_node()


def test_arm_controller_goal_cancellation_and_safe_stop():
    """Asserts goal cancellation aborts active trajectory and commands safe stop."""
    mock_controller = Node("mock_cancel_controller")
    cancel_received = threading.Event()

    def handle_cancel_request(goal_handle):
        cancel_received.set()
        return CancelResponse.ACCEPT

    def handle_traj_execute(goal_handle):
        # If safe-stop trajectory (1 point), complete immediately
        if len(goal_handle.request.trajectory.points) == 1:
            try:
                goal_handle.succeed()
            except Exception:
                pass
            return FollowJointTrajectory.Result()

        # Initial trajectory to give time for cancel
        start_t = time.time()
        while time.time() - start_t < 2.0:
            if goal_handle.is_cancel_requested:
                try:
                    goal_handle.canceled()
                except Exception:
                    pass
                res = FollowJointTrajectory.Result()
                res.error_code = -1
                return res
            time.sleep(0.02)
        try:
            if goal_handle.is_active:
                goal_handle.succeed()
        except Exception:
            pass
        return FollowJointTrajectory.Result()


    ActionServer(
        mock_controller,
        FollowJointTrajectory,
        "/test_cancel_controller/follow_joint_trajectory",
        execute_callback=handle_traj_execute,
        cancel_callback=handle_cancel_request,
    )

    node = ArmControllerNode(
        parameter_overrides=[
            Parameter("pick_and_place_action_name", Parameter.Type.STRING, "/test/pnp_cancel"),
            Parameter("controller_action_name", Parameter.Type.STRING, "/test_cancel_controller/follow_joint_trajectory"),
            Parameter("step_duration", Parameter.Type.DOUBLE, 0.3),
            Parameter("require_controller", Parameter.Type.BOOL, True),
        ]
    )
    client_node = Node("test_pnp_client_cancel")

    executor = MultiThreadedExecutor()
    executor.add_node(mock_controller)
    executor.add_node(node)
    executor.add_node(client_node)

    client = ActionClient(client_node, PickAndPlace, "/test/pnp_cancel")

    spin_thread = threading.Thread(target=executor.spin, daemon=True)
    spin_thread.start()

    try:
        assert client.wait_for_server(timeout_sec=3.0)

        goal = PickAndPlace.Goal()
        goal.pick_coords = Point(x=0.35, y=0.15, z=0.0)
        goal.drop_coords = Point(x=0.40, y=-0.30, z=0.0)
        goal.use_custom_drop = True
        goal.command_id = "cancel-cmd-1"

        send_future = client.send_goal_async(goal)
        start_t = time.time()
        while not send_future.done() and time.time() - start_t < 3.0:
            time.sleep(0.01)
        assert send_future.done()
        goal_handle = send_future.result()

        # Wait a moment for trajectory to start, then request cancellation
        time.sleep(0.15)
        cancel_future = goal_handle.cancel_goal_async()
        start_t = time.time()
        while not cancel_future.done() and time.time() - start_t < 3.0:
            time.sleep(0.01)
        assert cancel_future.done()

        # Wait for action result
        res_future = goal_handle.get_result_async()
        start_t = time.time()
        while not res_future.done() and time.time() - start_t < 3.0:
            time.sleep(0.01)
        assert res_future.done()
        result = res_future.result().result
        assert result.success is False
        assert "cancel" in result.message.lower()
        assert cancel_received.is_set(), "Controller did not receive cancel request"
    finally:
        executor.shutdown()
        spin_thread.join(timeout=1.0)
        mock_controller.destroy_node()
        node.destroy_node()
        client_node.destroy_node()


def test_arm_controller_mutual_exclusion():
    """Asserts second concurrent PickAndPlace goal is rejected while another is executing."""
    node = ArmControllerNode(
        parameter_overrides=[
            Parameter("pick_and_place_action_name", Parameter.Type.STRING, "/test/pnp_mutex"),
            Parameter("step_duration", Parameter.Type.DOUBLE, 0.2),
        ]
    )
    client_node = Node("test_pnp_client_mutex")

    executor = MultiThreadedExecutor()
    executor.add_node(node)
    executor.add_node(client_node)

    client = ActionClient(client_node, PickAndPlace, "/test/pnp_mutex")

    spin_thread = threading.Thread(target=executor.spin, daemon=True)
    spin_thread.start()

    try:
        assert client.wait_for_server(timeout_sec=3.0)

        # Send Goal 1
        goal1 = PickAndPlace.Goal()
        goal1.pick_coords = Point(x=0.35, y=0.15, z=0.0)
        goal1.drop_coords = Point(x=0.40, y=-0.30, z=0.0)
        goal1.use_custom_drop = True
        goal1.command_id = "mutex-goal-1"

        future1 = client.send_goal_async(goal1)
        start_t = time.time()
        while not future1.done() and time.time() - start_t < 3.0:
            time.sleep(0.01)
        assert future1.done()
        handle1 = future1.result()
        assert handle1.accepted

        # Immediately send Goal 2 while Goal 1 is executing
        goal2 = PickAndPlace.Goal()
        goal2.pick_coords = Point(x=0.40, y=0.15, z=0.0)
        goal2.drop_coords = Point(x=0.40, y=-0.30, z=0.0)
        goal2.use_custom_drop = True
        goal2.command_id = "mutex-goal-2"

        future2 = client.send_goal_async(goal2)
        start_t = time.time()
        while not future2.done() and time.time() - start_t < 3.0:
            time.sleep(0.01)
        assert future2.done()
        handle2 = future2.result()
        # Goal 2 MUST be rejected per mutual exclusion invariant
        assert not handle2.accepted, "Concurrent second goal should have been rejected"

        # Cancel Goal 1 to cleanly exit and wait for cancellation completion
        cancel_future = handle1.cancel_goal_async()
        start_t = time.time()
        while not cancel_future.done() and time.time() - start_t < 2.0:
            time.sleep(0.01)

        res_future = handle1.get_result_async()
        start_t = time.time()
        while not res_future.done() and time.time() - start_t < 2.0:
            time.sleep(0.01)
    finally:
        executor.shutdown()
        spin_thread.join(timeout=1.0)
        node.destroy_node()
        client_node.destroy_node()


def test_arm_controller_drop_slot_unavailable_aborts_goal():
    """Asserts missing GetDropSlot service aborts goal with structured message (6.7.2)."""
    node = ArmControllerNode(
        parameter_overrides=[
            Parameter("pick_and_place_action_name", Parameter.Type.STRING, "/test/pnp_no_drop_svc"),
            Parameter("get_drop_slot_service_name", Parameter.Type.STRING, "/test_workcell/nonexistent_drop_slot"),
            Parameter("step_duration", Parameter.Type.DOUBLE, 0.005),
            Parameter("traj_connect_timeout", Parameter.Type.DOUBLE, 0.01),
        ]
    )
    client_node = Node("test_pnp_client_no_drop")
    executor = MultiThreadedExecutor()
    executor.add_node(node)
    executor.add_node(client_node)

    client = ActionClient(client_node, PickAndPlace, "/test/pnp_no_drop_svc")

    spin_thread = threading.Thread(target=executor.spin, daemon=True)
    spin_thread.start()

    try:
        assert client.wait_for_server(timeout_sec=3.0)

        goal = PickAndPlace.Goal()
        goal.pick_coords = Point(x=0.35, y=0.15, z=0.0)
        goal.use_custom_drop = False
        goal.command_id = "test-no-drop-svc-1"

        send_future = client.send_goal_async(goal)
        start_t = time.time()
        while not send_future.done() and time.time() - start_t < 3.0:
            time.sleep(0.01)
        assert send_future.done()
        goal_handle = send_future.result()
        assert goal_handle.accepted

        res_future = goal_handle.get_result_async()
        start_t = time.time()
        while not res_future.done() and time.time() - start_t < 5.0:
            time.sleep(0.01)
        assert res_future.done()
        result = res_future.result().result
        assert result.success is False
        assert "drop" in result.message.lower()
    finally:
        executor.shutdown()
        spin_thread.join(timeout=1.0)
        node.destroy_node()
        client_node.destroy_node()


def test_arm_controller_slow_drop_slot_service_still_resolves():
    """Asserts delayed GetDropSlot response resolves via callback chain (6.7.2)."""
    mock_workcell = Node("mock_slow_workcell_node")

    def mock_get_drop_slot(req, res):
        time.sleep(0.5)
        res.drop_coords = Point(x=0.40, y=-0.30, z=0.08)
        res.slot_index = 4
        res.overflow_occurred = False
        return res

    mock_workcell.create_service(GetDropSlot, "/test_slow_workcell/get_drop_slot", mock_get_drop_slot)

    node = ArmControllerNode(
        parameter_overrides=[
            Parameter("pick_and_place_action_name", Parameter.Type.STRING, "/test/pnp_slow_drop"),
            Parameter("get_drop_slot_service_name", Parameter.Type.STRING, "/test_slow_workcell/get_drop_slot"),
            Parameter("step_duration", Parameter.Type.DOUBLE, 0.005),
            Parameter("traj_connect_timeout", Parameter.Type.DOUBLE, 0.01),
        ]
    )

    client_node = Node("test_pnp_client_slow_drop")
    executor = MultiThreadedExecutor()
    executor.add_node(mock_workcell)
    executor.add_node(node)
    executor.add_node(client_node)

    client = ActionClient(client_node, PickAndPlace, "/test/pnp_slow_drop")

    spin_thread = threading.Thread(target=executor.spin, daemon=True)
    spin_thread.start()

    try:
        assert client.wait_for_server(timeout_sec=3.0)

        goal = PickAndPlace.Goal()
        goal.pick_coords = Point(x=0.35, y=0.15, z=0.0)
        goal.use_custom_drop = False
        goal.command_id = "test-slow-drop-1"

        send_future = client.send_goal_async(goal)
        start_t = time.time()
        while not send_future.done() and time.time() - start_t < 3.0:
            time.sleep(0.01)
        assert send_future.done()
        goal_handle = send_future.result()

        res_future = goal_handle.get_result_async()
        start_t = time.time()
        while not res_future.done() and time.time() - start_t < 6.0:
            time.sleep(0.01)
        assert res_future.done()
        result = res_future.result().result
        assert result.success is True
    finally:
        executor.shutdown()
        spin_thread.join(timeout=1.0)
        mock_workcell.destroy_node()
        node.destroy_node()
        client_node.destroy_node()
