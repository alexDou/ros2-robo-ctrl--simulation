"""Unit 6.7.3 red: edge state sub + auto-dispatch + grasp/commit."""
import json, threading, time
import pytest, rclpy
from controller_manager_msgs.srv import SwitchController
from geometry_msgs.msg import Point
from rclpy.action import ActionServer
from rclpy.executors import MultiThreadedExecutor
from rclpy.node import Node
from rclpy.parameter import Parameter
from std_msgs.msg import String
from domain import CommandType, RobotCommand, RobotState
from robot_control_interfaces.action import PickAndPlace
from robot_control_interfaces.srv import CommitDrop, MarkGrasped, SpawnObject
from arm_controller.edge_bridge_node import EdgeBridgeNode

@pytest.fixture(autouse=True)
def ros_context():
    if not rclpy.ok(): rclpy.init()
    yield
    if rclpy.ok(): rclpy.shutdown()

_c = [200]
def _sw(ex):
    _c[0] += 1
    n = Node(f"fsw_wc_{_c[0]}")
    n.create_service(SwitchController, "/controller_manager/switch_controller", lambda rq, rs: (setattr(rs, "ok", True), setattr(rs, "message", "f"), rs)[-1])
    ex.add_node(n)
    return n

def _engage(node):
    node.handle_command(RobotCommand(command_id="e", sender_id="t", timestamp_ns=time.time_ns(), type=CommandType.ENGAGE, payload={}))
    assert node.robot_state == RobotState.IDLE

def test_edge_caches_workcell_state_snapshot():
    node = EdgeBridgeNode(parameter_overrides=[Parameter("robot_id", Parameter.Type.STRING, "t-wc-cache"), Parameter("auto_home_on_startup", Parameter.Type.BOOL, False), Parameter("auto_connect_zenoh", Parameter.Type.BOOL, False), Parameter("switch_timeout", Parameter.Type.DOUBLE, 0.1)])
    try:
        m = String(); m.data = json.dumps({"spawned": [{"id": "g1", "x": 0.45, "y": 0.10, "z": 0.0, "color": "GREEN", "intact": True}], "in_progress": [], "processed": [], "active_id": "g1"})
        node._on_workcell_state(m)
        t = node.publish_telemetry()
        assert len(t.workcell_state.spawned) == 1 and t.workcell_state.spawned[0].id == "g1" and t.workcell_state.active_id == "g1"
    finally:
        node.close(); node.destroy_node()

def test_edge_spawn_async_auto_dispatches_pnp():
    mw = Node("mw_auto"); ma = Node("ma_auto"); goals = []
    mw.create_service(SpawnObject, "/t_auto/spawn_object", lambda rq, rs: (setattr(rs, "success", True), setattr(rs, "message", "ok"), setattr(rs, "gear_id", "u1"), rs)[-1])
    def ex_pnp(gh):
        goals.append(gh.request); gh.succeed()
        return PickAndPlace.Result(success=True, message="d")
    srv = ActionServer(ma, PickAndPlace, "/t_auto/pnp", execute_callback=ex_pnp)
    node = EdgeBridgeNode(parameter_overrides=[Parameter("robot_id", Parameter.Type.STRING, "t-auto"), Parameter("spawn_object_service_name", Parameter.Type.STRING, "/t_auto/spawn_object"), Parameter("pick_and_place_action_name", Parameter.Type.STRING, "/t_auto/pnp"), Parameter("auto_home_on_startup", Parameter.Type.BOOL, False), Parameter("auto_connect_zenoh", Parameter.Type.BOOL, False), Parameter("switch_timeout", Parameter.Type.DOUBLE, 0.1)])
    ex = MultiThreadedExecutor(); ex.add_node(mw); ex.add_node(ma); ex.add_node(node); f = _sw(ex)
    th = threading.Thread(target=ex.spin, daemon=True); th.start()
    try:
        _engage(node)
        node.handle_command(RobotCommand(command_id="s1", sender_id="u", timestamp_ns=time.time_ns(), type=CommandType.SPAWN_OBJECT, payload={"x": 0.45, "y": 0.10, "z": 0.0, "object_type": "GEAR"}))
        st = time.time()
        while not goals and time.time() - st < 4.0: time.sleep(0.02)
        assert len(goals) == 1 and abs(goals[0].pick_coords.x - 0.45) < 1e-4
    finally:
        ex.shutdown(); th.join(timeout=1.0)
        try: f.destroy_node()
        except Exception: pass
        srv.destroy(); ma.destroy_node(); mw.destroy_node(); node.close(); node.destroy_node()

def test_edge_feedback_triggers_grasp_and_commit():
    mw = Node("mw_gc"); ma = Node("ma_gc"); grasp = []; commit = []
    mw.create_service(MarkGrasped, "/t_gc/mark", lambda rq, rs: (grasp.append(1), setattr(rs, "success", True), setattr(rs, "message", "g"), rs)[-1])
    def ccb(rq, rs):
        commit.append(1); rs.success = True; rs.message = "c"; rs.drop_coords = Point(x=0.4, y=-0.3, z=0.0); rs.slot_index = 0; rs.overflow_occurred = False
        return rs
    mw.create_service(CommitDrop, "/t_gc/commit", ccb)
    def ex_pnp(gh):
        for ph, pc in (("GRASPING", 30.0), ("RELEASING", 80.0)):
            fb = PickAndPlace.Feedback(); fb.phase = ph; fb.percent_complete = pc; gh.publish_feedback(fb); time.sleep(0.05)
        gh.succeed()
        return PickAndPlace.Result(success=True, message="d")
    srv = ActionServer(ma, PickAndPlace, "/t_gc/pnp", execute_callback=ex_pnp)
    node = EdgeBridgeNode(parameter_overrides=[Parameter("robot_id", Parameter.Type.STRING, "t-gc"), Parameter("pick_and_place_action_name", Parameter.Type.STRING, "/t_gc/pnp"), Parameter("mark_grasped_service_name", Parameter.Type.STRING, "/t_gc/mark"), Parameter("commit_drop_service_name", Parameter.Type.STRING, "/t_gc/commit"), Parameter("auto_home_on_startup", Parameter.Type.BOOL, False), Parameter("auto_connect_zenoh", Parameter.Type.BOOL, False), Parameter("switch_timeout", Parameter.Type.DOUBLE, 0.1)])
    ex = MultiThreadedExecutor(); ex.add_node(mw); ex.add_node(ma); ex.add_node(node); f = _sw(ex)
    th = threading.Thread(target=ex.spin, daemon=True); th.start()
    try:
        _engage(node)
        node.handle_command(RobotCommand(command_id="g1", sender_id="t", timestamp_ns=time.time_ns(), type=CommandType.PICK_AND_PLACE_TARGET, payload={"pick_x": 0.45, "pick_y": 0.1, "pick_z": 0.0}))
        st = time.time()
        while (not grasp or not commit) and time.time() - st < 5.0: time.sleep(0.02)
        assert grasp and commit
    finally:
        ex.shutdown(); th.join(timeout=1.0)
        try: f.destroy_node()
        except Exception: pass
        srv.destroy(); ma.destroy_node(); mw.destroy_node(); node.close(); node.destroy_node()

def test_edge_spawn_failure_no_dispatch_no_retry():
    mw = Node("mw_fail"); calls = []
    mw.create_service(SpawnObject, "/t_fail/spawn", lambda rq, rs: (calls.append(1), setattr(rs, "success", False), setattr(rs, "message", "busy"), setattr(rs, "gear_id", ""), rs)[-1])
    node = EdgeBridgeNode(parameter_overrides=[Parameter("robot_id", Parameter.Type.STRING, "t-fail"), Parameter("spawn_object_service_name", Parameter.Type.STRING, "/t_fail/spawn"), Parameter("auto_home_on_startup", Parameter.Type.BOOL, False), Parameter("auto_connect_zenoh", Parameter.Type.BOOL, False), Parameter("switch_timeout", Parameter.Type.DOUBLE, 0.1)])
    errs = []
    node._publish_error = lambda code, msg: errs.append((code, msg))
    ex = MultiThreadedExecutor(); ex.add_node(mw); ex.add_node(node); f = _sw(ex)
    th = threading.Thread(target=ex.spin, daemon=True); th.start()
    try:
        _engage(node)
        node.handle_command(RobotCommand(command_id="f1", sender_id="u", timestamp_ns=time.time_ns(), type=CommandType.SPAWN_OBJECT, payload={"x": 0.5, "y": 0.15, "z": 0.0, "object_type": "GEAR"}))
        st = time.time()
        while not errs and time.time() - st < 3.0: time.sleep(0.02)
        assert errs and node.robot_state == RobotState.IDLE
        n = len(calls); time.sleep(0.4); assert len(calls) == n
    finally:
        ex.shutdown(); th.join(timeout=1.0)
        try: f.destroy_node()
        except Exception: pass
        mw.destroy_node(); node.close(); node.destroy_node()
