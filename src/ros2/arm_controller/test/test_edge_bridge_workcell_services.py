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

import math
import threading
import time

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




def test_edge_bridge_spawn_object_and_clear_workspace_services(make_switch_server):
    """Asserts SPAWN_OBJECT and CLEAR_WORKSPACE commands bridge to ROS2 services."""
    mock_workcell = Node("mock_workcell_services")
    active_workpiece: list[tuple[float, float, float]] = []

    def handle_spawn(req: SpawnObject.Request, res: SpawnObject.Response) -> SpawnObject.Response:
        if active_workpiece:
            res.success = False
            res.message = "Workpiece already active on table"
            res.gear_id = ""
            return res
        active_workpiece.append((req.coords.x, req.coords.y, req.coords.z))
        res.success = True
        res.message = "Object spawned"
        res.gear_id = "test-gear-1"
        return res

    def handle_clear(req: ClearWorkspace.Request, res: ClearWorkspace.Response) -> ClearWorkspace.Response:
        active_workpiece.clear()
        res.success = True
        res.message = "Workspace reset"
        return res

    spawn_srv = mock_workcell.create_service(SpawnObject, "/test_workcell/spawn_object", handle_spawn)
    clear_srv = mock_workcell.create_service(ClearWorkspace, "/test_workcell/clear_workspace", handle_clear)

    from robot_control_interfaces.action import PickAndPlace as _Pnp

    mock_arm = Node("mock_arm_spawn_auto_dispatch")

    def _handle_pnp(gh):
        gh.succeed()
        return _Pnp.Result(success=True, message="done")

    pnp_srv = ActionServer(mock_arm, _Pnp, "/arm_controller/pick_and_place", execute_callback=_handle_pnp)

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
    executor.add_node(mock_arm)
    executor.add_node(node)
    _fake = make_switch_server(executor)

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
        errs: list = []
        _orig_err = node._publish_error
        node._publish_error = lambda code, msg: errs.append((code, msg))  # type: ignore[method-assign]

        def _wait_for(pred, timeout=3.0):
            start = time.time()
            while time.time() - start < timeout:
                if pred():
                    return True
                time.sleep(0.02)
            return False

        telem = node.handle_command(cmd_spawn)
        assert telem is not None
        assert telem.command_id == "cmd-spawn-01"
        assert _wait_for(lambda: len(active_workpiece) == 1), "async spawn must reach workcell"
        assert _wait_for(lambda: node.robot_state == RobotState.IDLE), "auto-dispatched PnP must complete"
        assert math.isclose(active_workpiece[0][0], 0.45, abs_tol=1e-4)

        # 2. Second SPAWN_OBJECT command when occupied -> async WORKCELL_OCCUPIED error
        cmd_spawn_occupied = RobotCommand(
            command_id="cmd-spawn-02",
            sender_id="ui-client",
            timestamp_ns=time.time_ns(),
            type=CommandType.SPAWN_OBJECT,
            payload={"x": 0.50, "y": 0.15, "z": 0.0, "object_type": "GEAR"},
        )
        # Auto-dispatch puts robot EXECUTING; second spawn rejected sync as busy.
        assert _wait_for(lambda: node.robot_state == RobotState.EXECUTING, timeout=1.0) or node.robot_state == RobotState.IDLE
        res_occupied = node.handle_command(cmd_spawn_occupied)
        if node.robot_state == RobotState.EXECUTING:
            assert res_occupied is None
            assert _wait_for(lambda: node.robot_state == RobotState.IDLE), "auto-dispatched PnP must complete"
        else:
            assert _wait_for(lambda: len(errs) > 0), "occupied spawn must emit ErrorFrame"
            assert errs[-1][0] == "WORKCELL_OCCUPIED"

        # 3. Valid CLEAR_WORKSPACE command (async)
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
        assert _wait_for(lambda: len(active_workpiece) == 0), "async clear must wipe workcell"

        # 4. Spawning works again after clearing
        telem_again = node.handle_command(cmd_spawn)
        assert telem_again is not None
        assert _wait_for(lambda: len(active_workpiece) == 1)
    finally:
        executor.shutdown()
        spin_thread.join(timeout=1.0)
        try:
            _fake.destroy_node()
        except Exception:
            pass
        spawn_srv.destroy()
        clear_srv.destroy()
        pnp_srv.destroy()
        mock_arm.destroy_node()
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
