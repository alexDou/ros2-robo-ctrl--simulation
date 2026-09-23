"""Gentle STANDBY teardown: park-before-deactivate (hand-sim-s0sw)."""

import math
import threading
import time

import rclpy
from control_msgs.action import FollowJointTrajectory
from controller_manager_msgs.srv import SwitchController
from rclpy.action import ActionServer, CancelResponse
from rclpy.executors import MultiThreadedExecutor
from rclpy.node import Node
from rclpy.parameter import Parameter

from domain import CANONICAL_POSES, CommandType, PoseName, RobotCommand, RobotState
from robot_control_interfaces.action import PickAndPlace

from arm_controller.edge_bridge_node import EdgeBridgeNode



def _cmd(cid, ctype, payload=None):
    return RobotCommand(
        command_id=cid, sender_id="test-client",
        timestamp_ns=time.time_ns(), type=ctype, payload=payload or {},
    )


def _make_node(name, action_name="/test_standby/follow_joint_trajectory",
               pnp_action_name="/test_standby/pick_and_place",
               traj_timeout=2.0, park_timeout=5.0):
    return EdgeBridgeNode(
        parameter_overrides=[
            Parameter("robot_id", Parameter.Type.STRING, name),
            Parameter("controller_action_name", Parameter.Type.STRING, action_name),
            Parameter("pick_and_place_action_name", Parameter.Type.STRING, pnp_action_name),
            Parameter("auto_home_on_startup", Parameter.Type.BOOL, False),
            Parameter("step_duration", Parameter.Type.DOUBLE, 0.05),
            Parameter("traj_connect_timeout", Parameter.Type.DOUBLE, traj_timeout),
            Parameter("standby_park_timeout", Parameter.Type.DOUBLE, park_timeout),
            Parameter("auto_connect_zenoh", Parameter.Type.BOOL, False),
            Parameter("switch_timeout", Parameter.Type.DOUBLE, 0.1),
        ]
    )


def _is_home(positions):
    return all(
        math.isclose(q, h, abs_tol=1e-4)
        for q, h in zip(positions, CANONICAL_POSES[PoseName.HOME]))


def _add_traj_server(executor, tag, action_name, hold_pose=None):
    mock = Node("mock_traj_standby_" + tag)
    received = []
    hold_started = threading.Event()
    hold_cancelled = threading.Event()

    def _execute(goal_handle):
        req = goal_handle.request
        received.append(req)
        target = list(req.trajectory.points[0].positions)
        if hold_pose is not None and all(
                math.isclose(q, h, abs_tol=1e-4) for q, h in zip(target, hold_pose)):
            hold_started.set()
            for _ in range(100):
                if goal_handle.is_cancel_requested:
                    hold_cancelled.set()
                    goal_handle.canceled()
                    res = FollowJointTrajectory.Result()
                    res.error_code = FollowJointTrajectory.Result.SUCCESSFUL
                    return res
                time.sleep(0.05)
        goal_handle.succeed()
        res = FollowJointTrajectory.Result()
        res.error_code = FollowJointTrajectory.Result.SUCCESSFUL
        return res

    server = ActionServer(
        mock, FollowJointTrajectory, action_name,
        execute_callback=_execute,
        cancel_callback=lambda req: CancelResponse.ACCEPT)
    executor.add_node(mock)
    return mock, server, received, hold_started, hold_cancelled


def _add_pnp_server(executor, tag, action_name):
    mock = Node("mock_pnp_standby_" + tag)
    exec_started = threading.Event()
    cancel_received = threading.Event()

    def _execute(goal_handle):
        exec_started.set()
        for _ in range(100):
            if goal_handle.is_cancel_requested:
                cancel_received.set()
                goal_handle.canceled()
                return PickAndPlace.Result(success=False, message="cancelled by standby")
            time.sleep(0.05)
        goal_handle.succeed()
        return PickAndPlace.Result(success=True, message="OK")

    server = ActionServer(
        mock, PickAndPlace, action_name,
        execute_callback=_execute,
        cancel_callback=lambda req: CancelResponse.ACCEPT)
    executor.add_node(mock)
    return mock, server, exec_started, cancel_received


def test_standby_during_motion_parks_home_once(make_switch_server):
    node = _make_node("test-sb-motion")
    executor = MultiThreadedExecutor()
    executor.add_node(node)
    make_switch_server(executor, ok=True)
    traj_node, traj_srv, received, hold_started, hold_cancelled = _add_traj_server(
        executor, "motion", "/test_standby/follow_joint_trajectory",
        hold_pose=list(CANONICAL_POSES[PoseName.READY]))
    spin = threading.Thread(target=executor.spin, daemon=True)
    spin.start()
    try:
        node.handle_command(_cmd("e1", CommandType.ENGAGE))
        assert node.robot_state == RobotState.IDLE
        node.handle_command(_cmd("m1", CommandType.TRAJECTORY_EXECUTE, {"pose_name": "READY"}))
        assert hold_started.wait(timeout=3.0)
        assert node.robot_state == RobotState.EXECUTING
        received.clear()
        telem = node.handle_command(_cmd("s1", CommandType.STANDBY))
        assert node.robot_state == RobotState.STANDBY
        assert node._joint_sub is None
        assert hold_cancelled.wait(timeout=2.0), "active trajectory goal was not cancelled"
        assert len(received) == 1, "expected exactly one park goal, got %d" % len(received)
        assert _is_home(received[0].trajectory.points[0].positions)
        assert telem is not None and telem.robot_state == RobotState.STANDBY
    finally:
        executor.shutdown()
        spin.join(timeout=1.0)
        traj_srv.destroy()
        traj_node.destroy_node()
        node.close()
        node.destroy_node()


def test_standby_while_ready_skips_park_but_deactivates():
    node = _make_node("test-sb-ready")
    executor = MultiThreadedExecutor()
    executor.add_node(node)
    switch_calls = []
    switch_node = Node("fake_switch_standby_ready")

    def _cb(req, res):
        switch_calls.append((list(req.activate_controllers), list(req.deactivate_controllers)))
        res.ok = True
        res.message = "fake accept"
        return res

    switch_node.create_service(SwitchController, "/controller_manager/switch_controller", _cb)
    executor.add_node(switch_node)
    traj_node, traj_srv, received, _, _ = _add_traj_server(
        executor, "ready", "/test_standby/follow_joint_trajectory")
    spin = threading.Thread(target=executor.spin, daemon=True)
    spin.start()
    try:
        node.handle_command(_cmd("e1", CommandType.ENGAGE))
        assert node.robot_state == RobotState.IDLE
        assert node._joint_sub is not None
        received.clear()
        switch_calls.clear()
        telem = node.handle_command(_cmd("s1", CommandType.STANDBY))
        assert node.robot_state == RobotState.STANDBY
        assert node._joint_sub is None
        assert received == [], "no park goal expected while ready"
        assert switch_calls, "deactivation switch expected"
        assert switch_calls[-1][1], "deactivate list must be non-empty"
        assert telem is not None and telem.robot_state == RobotState.STANDBY
    finally:
        executor.shutdown()
        spin.join(timeout=1.0)
        traj_srv.destroy()
        traj_node.destroy_node()
        switch_node.destroy_node()
        node.close()
        node.destroy_node()


def test_standby_bounded_when_servers_down():
    node = _make_node("test-sb-bounded",
                      action_name="/test_standby_missing/follow_joint_trajectory",
                      traj_timeout=0.2, park_timeout=0.5)
    try:
        with node._lock:
            node._robot_state = RobotState.EXECUTING
        start = time.monotonic()
        telem = node.handle_command(_cmd("s1", CommandType.STANDBY))
        elapsed = time.monotonic() - start
        assert elapsed < 4.0, "STANDBY blocked %.2fs without servers" % elapsed
        assert node.robot_state == RobotState.STANDBY
        assert node._joint_sub is None
        assert telem is not None and telem.robot_state == RobotState.STANDBY
    finally:
        node.close()
        node.destroy_node()


def test_standby_cancels_active_pick_and_place_first(make_switch_server):
    node = _make_node("test-sb-pnp")
    executor = MultiThreadedExecutor()
    executor.add_node(node)
    make_switch_server(executor, ok=True)
    traj_node, traj_srv, received, _, _ = _add_traj_server(
        executor, "pnp_park", "/test_standby/follow_joint_trajectory")
    pnp_node, pnp_srv, pnp_started, pnp_cancelled = _add_pnp_server(
        executor, "pnp", "/test_standby/pick_and_place")
    spin = threading.Thread(target=executor.spin, daemon=True)
    spin.start()
    try:
        node.handle_command(_cmd("e1", CommandType.ENGAGE))
        assert node.robot_state == RobotState.IDLE
        node.handle_command(_cmd("p1", CommandType.PICK_AND_PLACE_TARGET,
                                 {"pick_x": 0.45, "pick_y": 0.10, "pick_z": 0.0}))
        assert pnp_started.wait(timeout=3.0)
        assert node.robot_state == RobotState.EXECUTING
        received.clear()
        node.handle_command(_cmd("s1", CommandType.STANDBY))
        assert pnp_cancelled.wait(timeout=2.0), "active PickAndPlace goal was not cancelled"
        assert node.robot_state == RobotState.STANDBY
        assert node._joint_sub is None
        assert len(received) == 1
        assert _is_home(received[0].trajectory.points[0].positions)
    finally:
        executor.shutdown()
        spin.join(timeout=1.0)
        pnp_srv.destroy()
        pnp_node.destroy_node()
        traj_srv.destroy()
        traj_node.destroy_node()
        node.close()
        node.destroy_node()
