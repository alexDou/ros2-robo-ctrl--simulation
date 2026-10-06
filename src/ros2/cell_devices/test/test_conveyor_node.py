"""ConveyorNode: ConveyorRun action + ConveyorStop service against an in-process virtual_plc."""

import json
import socket
import threading
import time

import pytest
import rclpy
from cell_devices.belt_sim import BeltParams
from cell_devices.conveyor_node import ConveyorNode
from cell_devices.register_map import StationState
from cell_devices.virtual_plc import VirtualPlcServer
from rclpy.action import ActionClient
from rclpy.executors import MultiThreadedExecutor
from rclpy.parameter import Parameter
from robot_control_interfaces.action import ConveyorRun
from robot_control_interfaces.srv import ConveyorFinish, ConveyorFreeze, ConveyorStop
from std_msgs.msg import String

FAST = BeltParams(speed_mm_s=2000.0, accel_mm_s2=20000.0)
TIMEOUT = 10.0


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture
def cell():
    rclpy.init()
    port = _free_port()
    plc = VirtualPlcServer("127.0.0.1", port, belt=FAST)
    plc.start()
    node = ConveyorNode(
        parameter_overrides=[
            Parameter("host", value="127.0.0.1"),
            Parameter("port", value=port),
            Parameter("counts_per_mm", value=FAST.counts_per_mm),
            Parameter("poll_hz", value=50.0),
        ]
    )
    client_node = rclpy.create_node("conveyor_test_client")
    executor = MultiThreadedExecutor(num_threads=4)
    executor.add_node(node)
    executor.add_node(client_node)
    spinner = threading.Thread(target=executor.spin, daemon=True)
    spinner.start()
    action = ActionClient(client_node, ConveyorRun, "conveyor/run")
    stop = client_node.create_client(ConveyorStop, "conveyor/stop")
    assert action.wait_for_server(timeout_sec=TIMEOUT)
    assert stop.wait_for_service(timeout_sec=TIMEOUT)
    yield plc, action, stop
    executor.shutdown()
    node.destroy_node()
    client_node.destroy_node()
    plc.stop()
    rclpy.shutdown()


def _send(action, mode):
    done = threading.Event()
    box = {}

    def on_goal(fut):
        box["handle"] = fut.result()
        box["handle"].get_result_async().add_done_callback(on_result)

    def on_result(fut):
        box["result"] = fut.result()
        done.set()

    action.send_goal_async(ConveyorRun.Goal(mode=mode)).add_done_callback(on_goal)
    return box, done


def test_run_to_pickzone_succeeds_with_stop_reason(cell):
    plc, action, _ = cell
    plc.add_belt_item(at_mm=0.0)

    box, done = _send(action, ConveyorRun.Goal.RUN_TO_PICKZONE)

    assert done.wait(TIMEOUT)
    result = box["result"].result
    assert result.success is True
    assert result.stop_reason == "STOPPED_AT_EYE"


def test_flush_reports_the_exit_count_delta(cell):
    plc, action, _ = cell
    for i in range(4):
        plc.add_belt_item(at_mm=-60.0 * i)

    box, done = _send(action, ConveyorRun.Goal.FLUSH)

    assert done.wait(TIMEOUT)
    result = box["result"].result
    assert (result.success, result.stop_reason, result.exit_count_delta) == (
        True,
        "FLUSH_DONE",
        4,
    )


def test_run_is_aborted_with_held_bin_away(cell):
    plc, action, _ = cell
    plc.set_station_state("scrap", StationState.AWAY)

    box, done = _send(action, ConveyorRun.Goal.RUN_TO_PICKZONE)

    assert done.wait(TIMEOUT)
    result = box["result"].result
    assert (result.success, result.stop_reason) == (False, "HELD_BIN_AWAY")


def test_stop_service_ends_a_running_goal_as_stopped(cell):
    plc, action, stop = cell  # empty belt: RUN_TO_PICKZONE never reaches an eye
    box, done = _send(action, ConveyorRun.Goal.RUN_TO_PICKZONE)
    deadline = time.monotonic() + TIMEOUT
    while plc.encoder_counts == 0 and time.monotonic() < deadline:
        time.sleep(0.02)  # the belt is demonstrably running before we stop it
    assert plc.encoder_counts > 0

    response = stop.call(ConveyorStop.Request(), timeout_sec=TIMEOUT)

    assert response.success is True
    assert done.wait(TIMEOUT)
    result = box["result"].result
    assert (result.success, result.stop_reason) == (False, "STOPPED")


def test_status_carries_gears_tracked_from_placement_records(cell):
    plc, _, _ = cell
    probe = rclpy.create_node("belt_tracking_probe")
    placement_pub = probe.create_publisher(String, "feeder/placement", 10)
    seen: list[dict] = []
    probe.create_subscription(
        String, "conveyor/status", lambda m: seen.append(json.loads(m.data)), 10
    )
    record = {"seq": 1, "lateral_x_mm": 10, "encoder_mm": 0.0, "color": "BLUE", "intact": False}

    deadline = time.monotonic() + TIMEOUT
    while time.monotonic() < deadline and not any(s.get("gears") for s in seen):
        placement_pub.publish(String(data=json.dumps(record)))
        rclpy.spin_once(probe, timeout_sec=0.05)
    probe.destroy_node()

    gear = next(s["gears"] for s in seen if s.get("gears"))[0]
    assert (gear["color"], gear["intact"]) == ("BLUE", False)
    assert gear["x"] == pytest.approx(0.4 + 0.01)
    assert gear["y"] == pytest.approx(0.85, abs=0.01)


def test_freeze_service_halts_the_belt_until_released(cell):
    plc, _, _ = cell
    plc.add_belt_item(at_mm=0.0)
    caller = rclpy.create_node("conveyor_freeze_caller")
    client = caller.create_client(ConveyorFreeze, "conveyor/freeze")
    assert client.wait_for_service(timeout_sec=TIMEOUT)

    def call(freeze):
        future = client.call_async(ConveyorFreeze.Request(freeze=freeze))
        rclpy.spin_until_future_complete(caller, future, timeout_sec=TIMEOUT)
        return future.result()

    try:
        assert call(True).success
        time.sleep(0.2)  # the controller executes it on its next tick
        frozen_at = plc.encoder_counts
        time.sleep(0.2)
        assert plc.encoder_counts == frozen_at
        assert call(False).success
    finally:
        caller.destroy_node()


def test_finish_ends_a_feed_run_at_the_eye_instead_of_stopping_dead(cell):
    plc, action, _ = cell
    finish = action._node.create_client(ConveyorFinish, "conveyor/finish")
    assert finish.wait_for_service(timeout_sec=TIMEOUT)
    box, done = _send(action, ConveyorRun.Goal.RUN_TO_PICKZONE)  # empty belt: never reaches an eye
    deadline = time.monotonic() + TIMEOUT
    while plc.encoder_counts == 0 and time.monotonic() < deadline:
        time.sleep(0.02)

    assert finish.call(ConveyorFinish.Request(), timeout_sec=TIMEOUT).success

    assert done.wait(TIMEOUT)
    result = box["result"].result
    assert (result.success, result.stop_reason) == (True, "STOPPED_AT_EYE")
