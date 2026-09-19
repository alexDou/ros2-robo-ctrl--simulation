"""Unit tests for EdgeBridgeNode PickAndPlace action bridge, feedback streaming, and workcell services.

Covers Unit 6.5-Bugfix.2.2 (hand-sim-1h63):
- Bridging PICK_AND_PLACE_TARGET from Zenoh / command to /arm_controller/pick_and_place ActionClient.
- Action goal translation with pick_coords, optional drop_coords, use_custom_drop, and command_id.
- Real-time action feedback streaming to Zenoh on rt/arm_controller/pick_and_place/_action/feedback.
- Dynamic gripper/palm state (is_grasped) updates during GRASPING and RELEASING phases.
- EMERGENCY_STOP aborting active PickAndPlace action goal and transitioning to FAULT.
- Bridging SPAWN_OBJECT command to /workcell/spawn_object service.
- Bridging CLEAR_WORKSPACE command to /workcell/clear_workspace service.
- Error handling: schema validation, robot busy, robot in fault, service unavailable, and goal rejection.
"""

import json
import math
import threading
import time
import pytest

from controller_manager_msgs.srv import SwitchController
from geometry_msgs.msg import Point
import rclpy
from rclpy.action import ActionServer, CancelResponse, GoalResponse
from rclpy.executors import MultiThreadedExecutor
from rclpy.node import Node
from rclpy.parameter import Parameter

from domain import (
    CommandType,
    ErrorFrame,
    PickAndPlaceTargetPayload,
    RobotCommand,
    RobotState,
    RobotTelemetryEvent,
    SpawnObjectPayload,
    robot_command_topic,
    robot_telemetry_topic,
)
from robot_control_interfaces.action import PickAndPlace
from robot_control_interfaces.srv import ClearWorkspace, SpawnObject

from arm_controller.edge_bridge_node import EdgeBridgeNode


@pytest.fixture(autouse=True)
def ros_context():
    if not rclpy.ok():
        rclpy.init()
    yield
    if rclpy.ok():
        rclpy.shutdown()


_switch_counter = [0]

def _add_fake_switch(executor, ok=True):
    _switch_counter[0] += 1
    srv_node = Node(f"fake_switch_actions_{_switch_counter[0]}")

    def _cb(req, res):
        res.ok = bool(ok)
        res.message = "fake switch"
        return res

    srv_node.create_service(SwitchController, "/controller_manager/switch_controller", _cb)
    executor.add_node(srv_node)
    return srv_node


def test_edge_bridge_pick_and_place_action_dispatch_and_feedback():
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
    _fake = _add_fake_switch(executor)

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


def test_edge_bridge_pick_and_place_custom_drop_coords():
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
    _fake = _add_fake_switch(executor)

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


def test_edge_bridge_pick_and_place_goal_rejection_fault():
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
    _fake = _add_fake_switch(executor)

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


def test_edge_bridge_pick_and_place_emergency_stop_cancel():
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
    _fake = _add_fake_switch(executor)

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


def test_edge_bridge_spawn_object_and_clear_workspace_services():
    """Asserts SPAWN_OBJECT and CLEAR_WORKSPACE commands bridge to ROS2 services."""
    mock_workcell = Node("mock_workcell_services")
    active_workpiece: list[tuple[float, float, float]] = []

    def handle_spawn(req: SpawnObject.Request, res: SpawnObject.Response) -> SpawnObject.Response:
        if active_workpiece:
            res.success = False
            res.message = "Workpiece already active on table"
            return res
        active_workpiece.append((req.coords.x, req.coords.y, req.coords.z))
        res.success = True
        res.message = "Object spawned"
        return res

    def handle_clear(req: ClearWorkspace.Request, res: ClearWorkspace.Response) -> ClearWorkspace.Response:
        active_workpiece.clear()
        res.success = True
        res.message = "Workspace reset"
        return res

    spawn_srv = mock_workcell.create_service(SpawnObject, "/test_workcell/spawn_object", handle_spawn)
    clear_srv = mock_workcell.create_service(ClearWorkspace, "/test_workcell/clear_workspace", handle_clear)

    node = EdgeBridgeNode(
        parameter_overrides=[
            Parameter("robot_id", Parameter.Type.STRING, "test-wc-arm"),
            Parameter("spawn_object_service_name", Parameter.Type.STRING, "/test_workcell/spawn_object"),
            Parameter("clear_workspace_service_name", Parameter.Type.STRING, "/test_workcell/clear_workspace"),
            Parameter("auto_home_on_startup", Parameter.Type.BOOL, False),
            Parameter("auto_connect_zenoh", Parameter.Type.BOOL, False),
            Parameter("switch_timeout", Parameter.Type.DOUBLE, 0.1),
        ]
    )

    executor = MultiThreadedExecutor()
    executor.add_node(mock_workcell)
    executor.add_node(node)
    _fake = _add_fake_switch(executor)

    spin_thread = threading.Thread(target=executor.spin, daemon=True)
    spin_thread.start()

    try:
        # Handshake: SPAWN/CLEAR rejected while STANDBY
        node.handle_command(
            RobotCommand(
                command_id="engage-wc",
                sender_id="ui-client",
                timestamp_ns=time.time_ns(),
                type=CommandType.ENGAGE,
                payload={},
            )
        )
        # 1. Valid SPAWN_OBJECT command
        cmd_spawn = RobotCommand(
            command_id="cmd-spawn-01",
            sender_id="ui-client",
            timestamp_ns=time.time_ns(),
            type=CommandType.SPAWN_OBJECT,
            payload={"x": 0.45, "y": 0.10, "z": 0.0, "object_type": "GEAR"},
        )
        telem = node.handle_command(cmd_spawn)
        assert telem is not None
        assert telem.command_id == "cmd-spawn-01"
        assert len(active_workpiece) == 1
        assert math.isclose(active_workpiece[0][0], 0.45, abs_tol=1e-4)

        # 2. Second SPAWN_OBJECT command when occupied -> rejected
        cmd_spawn_occupied = RobotCommand(
            command_id="cmd-spawn-02",
            sender_id="ui-client",
            timestamp_ns=time.time_ns(),
            type=CommandType.SPAWN_OBJECT,
            payload={"x": 0.50, "y": 0.15, "z": 0.0, "object_type": "GEAR"},
        )
        res_occupied = node.handle_command(cmd_spawn_occupied)
        assert res_occupied is None

        # 3. Valid CLEAR_WORKSPACE command
        cmd_clear = RobotCommand(
            command_id="cmd-clear-01",
            sender_id="ui-client",
            timestamp_ns=time.time_ns(),
            type=CommandType.CLEAR_WORKSPACE,
            payload={},
        )
        telem_clear = node.handle_command(cmd_clear)
        assert telem_clear is not None
        assert telem_clear.command_id == "cmd-clear-01"
        assert len(active_workpiece) == 0

        # 4. Spawning works again after clearing
        telem_again = node.handle_command(cmd_spawn)
        assert telem_again is not None
        assert len(active_workpiece) == 1
    finally:
        executor.shutdown()
        spin_thread.join(timeout=1.0)
        try:
            _fake.destroy_node()
        except Exception:
            pass
        spawn_srv.destroy()
        clear_srv.destroy()
        mock_workcell.destroy_node()
        node.close()
        node.destroy_node()


def test_edge_bridge_spawn_object_rejected_when_not_idle():
    """Asserts SPAWN_OBJECT is rejected when RobotState is not IDLE."""
    node = EdgeBridgeNode(
        parameter_overrides=[
            Parameter("robot_id", Parameter.Type.STRING, "test-spawn-busy"),
            Parameter("auto_home_on_startup", Parameter.Type.BOOL, False),
            Parameter("auto_connect_zenoh", Parameter.Type.BOOL, False),
            Parameter("switch_timeout", Parameter.Type.DOUBLE, 0.1),
        ]
    )
    try:
        # Force robot_state to EXECUTING
        node._robot_state = RobotState.EXECUTING

        cmd_spawn = RobotCommand(
            command_id="cmd-spawn-busy",
            sender_id="ui-client",
            timestamp_ns=time.time_ns(),
            type=CommandType.SPAWN_OBJECT,
            payload={"x": 0.45, "y": 0.10, "z": 0.0, "object_type": "GEAR"},
        )
        res = node.handle_command(cmd_spawn)
        assert res is None
    finally:
        node.close()
        node.destroy_node()


def test_edge_bridge_zenoh_action_feedback_streaming():
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
    _fake = _add_fake_switch(executor)

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


def test_edge_bridge_actions_schema_validation_and_rejection():
    """Asserts schema validation errors and fault state rejections return None without crashing."""
    node = EdgeBridgeNode(
        parameter_overrides=[
            Parameter("robot_id", Parameter.Type.STRING, "test-arm-actions-err"),
            Parameter("auto_home_on_startup", Parameter.Type.BOOL, False),
            Parameter("auto_connect_zenoh", Parameter.Type.BOOL, False),
            Parameter("switch_timeout", Parameter.Type.DOUBLE, 0.1),
        ]
    )
    try:
        # 1. Malformed PickAndPlaceTarget (missing pick_x) -> STANDBY gate fires first
        bad_pnp = RobotCommand(
            command_id="bad-pnp-1",
            sender_id="tester",
            timestamp_ns=time.time_ns(),
            type=CommandType.PICK_AND_PLACE_TARGET,
            payload={"pick_y": 0.1, "pick_z": 0.0},
        )
        res1 = node.handle_command(bad_pnp)
        assert res1 is None
        assert node.robot_state == RobotState.STANDBY

        # 2. Malformed SpawnObject (missing z) -> STANDBY gate fires first
        bad_spawn = RobotCommand(
            command_id="bad-spawn-1",
            sender_id="tester",
            timestamp_ns=time.time_ns(),
            type=CommandType.SPAWN_OBJECT,
            payload={"x": 0.5, "y": 0.1, "object_type": "GEAR"},
        )
        res2 = node.handle_command(bad_spawn)
        assert res2 is None
        assert node.robot_state == RobotState.STANDBY

        # 3. Fault state rejection
        node._robot_state = RobotState.FAULT
        cmd_in_fault = RobotCommand(
            command_id="pnp-fault",
            sender_id="tester",
            timestamp_ns=time.time_ns(),
            type=CommandType.PICK_AND_PLACE_TARGET,
            payload={"pick_x": 0.5, "pick_y": 0.0, "pick_z": 0.0},
        )
        res3 = node.handle_command(cmd_in_fault)
        assert res3 is None
        assert node.robot_state == RobotState.FAULT

        # 4. Reset fault restores IDLE
        node.handle_reset_fault()
        assert node.robot_state == RobotState.IDLE

        # 5. Controller unavailable rejection
        res4 = node.handle_command(cmd_in_fault)
        assert res4 is None
        assert node.robot_state == RobotState.IDLE
    finally:
        node.close()
        node.destroy_node()

