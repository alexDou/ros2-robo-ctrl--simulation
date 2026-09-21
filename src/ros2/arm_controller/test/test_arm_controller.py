"""Unit tests for ArmControllerNode, AnalyticalInverseKinematics, and Action lifecycle.

Covers Refactor-A.2 (hand-sim-z7uz) acceptance criteria:
- AnalyticalInverseKinematics solver (<0.2ms solve time, downward orientation, 0.108m TCP offset)
- Reachability boundary enforcement
- 10-step Cartesian waypoint sequence generation and phase tagging
- PickAndPlace.action server ingesting pick coords and querying /workcell/get_drop_slot
- Real-time action feedback phases (APPROACHING through HOMING)
- Goal cancellation with trajectory abort and immediate safe stop
- Mock controller integration testing
"""

import math
import threading
import time
import pytest

from builtin_interfaces.msg import Duration
from control_msgs.action import FollowJointTrajectory
from geometry_msgs.msg import Point
import rclpy
from rclpy.action import ActionClient, ActionServer, CancelResponse, GoalResponse
from rclpy.executors import MultiThreadedExecutor, SingleThreadedExecutor
from rclpy.node import Node
from rclpy.parameter import Parameter
from sensor_msgs.msg import JointState

from arm_controller.arm_controller_node import (
    ArmControllerNode,
    seconds_to_duration,
)
from arm_controller.kinematics import (
    APPROACH_LIFT_OFFSET_M,
    CANONICAL_UR5E_JOINTS,
    DEFAULT_DOWNWARD_ORIENTATION,
    DEFAULT_SPINDLE_TOWER_COORDS,
    DEFAULT_TCP_OFFSET_M,
    HOME_JOINT_POSITIONS,
    ActionPhase,
    AnalyticalInverseKinematics,
    OutOfReachError,
    PickAndPlaceTrajectoryGenerator,
    UR5eKinematics,
    WaypointStep,
)
from robot_control_interfaces.action import PickAndPlace
from robot_control_interfaces.srv import GetDropSlot


@pytest.fixture(autouse=True)
def ros_context():
    if not rclpy.ok():
        rclpy.init()
    yield
    if rclpy.ok():
        rclpy.shutdown()


# ============================================================================
# Kinematics & Analytical IK Tests
# ============================================================================


def test_analytical_ik_solve_time_and_precision():
    """Asserts AnalyticalInverseKinematics solves in <0.2ms with <1mm Cartesian accuracy."""
    solver = AnalyticalInverseKinematics(tcp_offset=DEFAULT_TCP_OFFSET_M)

    # Warm-up
    for _ in range(50):
        solver.solve_ik(0.40, -0.30, 0.0)

    # Benchmark average solve time
    N = 1000
    t0 = time.perf_counter()
    for _ in range(N):
        solver.solve_ik(0.40, -0.30, 0.0)
    avg_solve_time_ms = (time.perf_counter() - t0) * 1000.0 / N

    assert avg_solve_time_ms < 0.20, f"Average solve time {avg_solve_time_ms:.4f}ms exceeds 0.2ms limit"

    # Positional accuracy test
    test_coords = [
        (0.40, -0.30, 0.0),
        (0.35, 0.15, 0.02),
        (0.50, -0.20, 0.10),
        (0.45, 0.10, 0.05),
    ]
    for x, y, z in test_coords:
        q = solver.solve_ik(x, y, z)
        assert len(q) == 6
        for angle in q:
            assert -math.pi <= angle <= math.pi

        T_tcp = solver.forward_kinematics(q, with_tcp=True)
        dx = T_tcp[0][3] - x
        dy = T_tcp[1][3] - y
        dz = T_tcp[2][3] - z
        err = math.sqrt(dx * dx + dy * dy + dz * dz)
        assert err < 0.001, f"Cartesian FK error {err*1000:.3f}mm exceeds 1mm limit at ({x}, {y}, {z})"


def test_downward_orientation_and_tcp_offset():
    """Asserts downward tool orientation and 0.108m TCP offset."""
    solver = AnalyticalInverseKinematics(tcp_offset=DEFAULT_TCP_OFFSET_M)
    x, y, z = 0.40, -0.25, 0.0
    q = solver.solve_ik(x, y, z, apply_tcp_offset=True)

    T_flange = solver.forward_kinematics(q, with_tcp=False)
    T_tcp = solver.forward_kinematics(q, with_tcp=True)

    # Flange Z should be exactly z + 0.108m
    assert abs(T_flange[2][3] - (z + DEFAULT_TCP_OFFSET_M)) < 0.001
    assert abs(T_tcp[2][3] - z) < 0.001

    # Tool Z-axis points straight downward [0, 0, -1]
    z_axis = [T_tcp[0][2], T_tcp[1][2], T_tcp[2][2]]
    assert abs(z_axis[0]) < 1e-3
    assert abs(z_axis[1]) < 1e-3
    assert abs(z_axis[2] - (-1.0)) < 1e-3


def test_reachability_boundary_enforcement():
    """Asserts out-of-reach coordinates raise OutOfReachError."""
    solver = AnalyticalInverseKinematics()

    # Inner boundary: R = 0.10m < 0.20m
    with pytest.raises(OutOfReachError):
        solver.check_reachability(0.10, 0.0, 0.0)

    # Outer boundary: R = 0.90m > 0.85m
    with pytest.raises(OutOfReachError):
        solver.check_reachability(0.90, 0.0, 0.0)

    # Table penetration: Z < 0.0m
    with pytest.raises(OutOfReachError):
        solver.check_reachability(0.40, 0.10, -0.05)


def test_10_step_waypoint_sequence_and_action_phases():
    """Asserts 10-step trajectory generation with proper phases and percent_complete."""
    gen = PickAndPlaceTrajectoryGenerator()
    pick = (0.35, 0.15, 0.0)
    drop = (0.40, -0.30, 0.04)

    steps = gen.generate_trajectory(pick_coords=pick, drop_coords=drop)
    assert len(steps) == 10

    expected_phases = [
        ActionPhase.APPROACHING.value,
        ActionPhase.PICKING.value,
        ActionPhase.GRASPING.value,
        ActionPhase.LIFTING.value,
        ActionPhase.TRANSFERRING.value,
        ActionPhase.DROPPING.value,
        ActionPhase.RELEASING.value,
        ActionPhase.RETREATING.value,
        ActionPhase.HOMING.value,
        ActionPhase.COMPLETED.value,
    ]
    assert [s.phase for s in steps] == expected_phases
    assert [s.percent_complete for s in steps] == [10.0 * i for i in range(1, 11)]

    # Pauses and grasp states
    assert steps[2].is_grasped is True and steps[2].pause_duration_s == 0.2  # grasp
    assert steps[3].is_grasped is True                                      # lift
    assert steps[4].is_grasped is True                                      # transfer
    assert steps[5].is_grasped is True                                      # drop
    assert steps[6].is_grasped is False and steps[6].pause_duration_s == 0.2 # release
    assert steps[8].is_grasped is False and steps[8].name == "home"

    # Verify URDF forward kinematics matches positive X workcell coordinate frame (+X forward)
    # Forward kinematics in DH frame gives (-x, -y, z), which in base_link (URDF) is (+x, +y, z)
    T_dh_pick = gen.solver.forward_kinematics(steps[1].joint_positions, with_tcp=True)
    urdf_pick_xyz = (-T_dh_pick[0][3], -T_dh_pick[1][3], T_dh_pick[2][3])
    assert abs(urdf_pick_xyz[0] - pick[0]) < 1e-3
    assert abs(urdf_pick_xyz[1] - pick[1]) < 1e-3
    assert abs(urdf_pick_xyz[2] - pick[2]) < 1e-3

    T_dh_drop = gen.solver.forward_kinematics(steps[5].joint_positions, with_tcp=True)
    urdf_drop_xyz = (-T_dh_drop[0][3], -T_dh_drop[1][3], T_dh_drop[2][3])
    assert abs(urdf_drop_xyz[0] - drop[0]) < 1e-3
    assert abs(urdf_drop_xyz[1] - drop[1]) < 1e-3
    assert abs(urdf_drop_xyz[2] - drop[2]) < 1e-3


# ============================================================================
# ArmControllerNode ROS2 Service and Action Server Tests
# ============================================================================


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


def test_angular_unwrapping_continuity():
    """Asserts consecutive waypoints do not suffer multi-revolution S^1 -> R boundary flips."""
    gen = PickAndPlaceTrajectoryGenerator()
    pick = (0.35, 0.15, 0.0)
    drop = (0.40, -0.30, 0.04)

    steps = gen.generate_trajectory(pick_coords=pick, drop_coords=drop)
    for i in range(1, len(steps)):
        q_prev = steps[i - 1].joint_positions
        q_curr = steps[i].joint_positions
        for j in range(6):
            delta = abs(q_curr[j] - q_prev[j])
            assert delta < math.pi + 0.1, (
                f"Joint {CANONICAL_UR5E_JOINTS[j]} between Step {steps[i-1].name} and "
                f"Step {steps[i].name} experienced discontinuity: {delta:.3f} rad > pi"
            )


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


