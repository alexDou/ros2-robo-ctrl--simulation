"""ConveyorNode: ConveyorRun action + ConveyorStop service against an in-process virtual_plc."""

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
from robot_control_interfaces.srv import ConveyorStop

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
