"""ArmControllerNode goal-admission tests (joint cache, reachability, drop-slot query)."""

import threading
import time

from geometry_msgs.msg import Point
import rclpy
from rclpy.action import ActionClient, ActionServer, CancelResponse, GoalResponse
from rclpy.node import Node
from rclpy.executors import MultiThreadedExecutor
from rclpy.parameter import Parameter
from sensor_msgs.msg import JointState

from arm_controller.arm_controller_node import (
    ArmControllerNode,
)
from robot_control_interfaces.action import PickAndPlace
from robot_control_interfaces.srv import GetDropSlot


def test_joint_state_subscriber_updates_canonical_joints():
    """Asserts /joint_states updates canonical joint positions regardless of incoming order."""
    node = ArmControllerNode()
    try:
        shuffled_names = [
            "wrist_3_joint",
            "shoulder_pan_joint",
            "wrist_1_joint",
            "elbow_joint",
            "shoulder_lift_joint",
            "wrist_2_joint",
        ]
        shuffled_positions = [0.6, 0.1, 0.4, 0.3, 0.2, 0.5]

        msg = JointState()
        msg.name = shuffled_names
        msg.position = shuffled_positions

        node._handle_joint_states(msg)
        assert node.current_joints == [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]
    finally:
        node.destroy_node()


def test_arm_controller_out_of_reach_goal_aborts():
    """Asserts out-of-reach pick coordinates reject/abort goal with structured error message."""
    node = ArmControllerNode(
        parameter_overrides=[
            Parameter("pick_and_place_action_name", Parameter.Type.STRING, "/test/pnp_out_of_reach"),
        ]
    )
    client_node = Node("test_pnp_client_oor")
    executor = MultiThreadedExecutor()
    executor.add_node(node)
    executor.add_node(client_node)

    client = ActionClient(client_node, PickAndPlace, "/test/pnp_out_of_reach")

    spin_thread = threading.Thread(target=executor.spin, daemon=True)
    spin_thread.start()

    try:
        assert client.wait_for_server(timeout_sec=3.0)

        goal = PickAndPlace.Goal()
        goal.pick_coords = Point(x=0.05, y=0.05, z=0.0)  # R ~ 0.07 < 0.20m (Out of reach)
        goal.use_custom_drop = True
        goal.drop_coords = Point(x=0.40, y=-0.30, z=0.0)
        goal.command_id = "test-oor-1"

        send_future = client.send_goal_async(goal)
        start_t = time.time()
        while not send_future.done() and time.time() - start_t < 3.0:
            time.sleep(0.01)
        assert send_future.done()
        goal_handle = send_future.result()
        assert goal_handle.accepted

        res_future = goal_handle.get_result_async()
        start_t = time.time()
        while not res_future.done() and time.time() - start_t < 3.0:
            time.sleep(0.01)
        assert res_future.done()
        result = res_future.result().result
        assert result.success is False
        assert "out of reach" in result.message.lower()
    finally:
        executor.shutdown()
        spin_thread.join(timeout=1.0)
        node.destroy_node()
        client_node.destroy_node()


def test_arm_controller_queries_workcell_drop_slot():
    """Asserts goal with use_custom_drop=False queries /workcell/get_drop_slot."""
    mock_workcell = Node("mock_workcell_node")
    drop_slot_called = threading.Event()

    def mock_get_drop_slot(req, res):
        drop_slot_called.set()
        res.drop_coords = Point(x=0.40, y=-0.30, z=0.08)
        res.slot_index = 4
        res.overflow_occurred = False
        return res

    mock_workcell.create_service(GetDropSlot, "/test_workcell/get_drop_slot", mock_get_drop_slot)

    node = ArmControllerNode(
        parameter_overrides=[
            Parameter("pick_and_place_action_name", Parameter.Type.STRING, "/test/pnp_query_drop"),
            Parameter("get_drop_slot_service_name", Parameter.Type.STRING, "/test_workcell/get_drop_slot"),
            Parameter("step_duration", Parameter.Type.DOUBLE, 0.005),
            Parameter("traj_connect_timeout", Parameter.Type.DOUBLE, 0.01),
        ]
    )

    client_node = Node("test_pnp_client_query")
    executor = MultiThreadedExecutor()
    executor.add_node(mock_workcell)
    executor.add_node(node)
    executor.add_node(client_node)

    client = ActionClient(client_node, PickAndPlace, "/test/pnp_query_drop")

    spin_thread = threading.Thread(target=executor.spin, daemon=True)
    spin_thread.start()

    try:
        assert client.wait_for_server(timeout_sec=3.0)

        goal = PickAndPlace.Goal()
        goal.pick_coords = Point(x=0.35, y=0.15, z=0.0)
        goal.use_custom_drop = False
        goal.command_id = "test-query-drop-1"

        send_future = client.send_goal_async(goal)
        start_t = time.time()
        while not send_future.done() and time.time() - start_t < 3.0:
            time.sleep(0.01)
        assert send_future.done()
        goal_handle = send_future.result()

        res_future = goal_handle.get_result_async()
        start_t = time.time()
        while not res_future.done() and time.time() - start_t < 4.0:
            time.sleep(0.01)
        assert res_future.done()
        result = res_future.result().result
        assert result.success is True
        assert drop_slot_called.is_set(), "Failed to query /workcell/get_drop_slot service"
    finally:
        executor.shutdown()
        spin_thread.join(timeout=1.0)
        mock_workcell.destroy_node()
        node.destroy_node()
        client_node.destroy_node()
