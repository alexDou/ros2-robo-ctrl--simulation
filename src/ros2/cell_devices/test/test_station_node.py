"""StationNode: StationExchange action against an in-process virtual_plc."""

import socket
import threading

import pytest
import rclpy
from cell_devices.register_map import StationState
from cell_devices.station_node import StationNode
from cell_devices.station_sim import StationParams
from cell_devices.virtual_plc import VirtualPlcServer
from rclpy.action import ActionClient
from rclpy.executors import MultiThreadedExecutor
from rclpy.parameter import Parameter
from robot_control_interfaces.action import StationExchange

QUICK = StationParams(leave_s=0.1, away_s=0.1, return_s=0.1)
TIMEOUT = 10.0


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture
def cell():
    rclpy.init()
    port = _free_port()
    plc = VirtualPlcServer("127.0.0.1", port, stations={"white": QUICK, "scrap": QUICK})
    plc.start()
    node = StationNode(
        parameter_overrides=[
            Parameter("station", value="white"),
            Parameter("host", value="127.0.0.1"),
            Parameter("port", value=port),
            Parameter("poll_hz", value=50.0),
        ]
    )
    client_node = rclpy.create_node("station_test_client")
    executor = MultiThreadedExecutor(num_threads=4)
    executor.add_node(node)
    executor.add_node(client_node)
    threading.Thread(target=executor.spin, daemon=True).start()
    action = ActionClient(client_node, StationExchange, "station/white/exchange")
    assert action.wait_for_server(timeout_sec=TIMEOUT)
    yield plc, action
    executor.shutdown()
    node.destroy_node()
    client_node.destroy_node()
    plc.stop()
    rclpy.shutdown()


def _send(action, feedback=None):
    done = threading.Event()
    box: dict = {}

    def on_goal(fut):
        box["handle"] = fut.result()
        if not box["handle"].accepted:
            done.set()
            return
        box["handle"].get_result_async().add_done_callback(on_result)

    def on_result(fut):
        box["result"] = fut.result()
        done.set()

    action.send_goal_async(StationExchange.Goal(), feedback_callback=feedback).add_done_callback(
        on_goal
    )
    assert done.wait(TIMEOUT)
    return box


def test_exchange_succeeds_and_feeds_back_every_state(cell):
    _, action = cell
    states: list[str] = []

    box = _send(action, lambda m: states.append(m.feedback.exchange_state))

    assert box["result"].result.success
    assert box["result"].result.final_state == "HOME"
    assert {"LEAVING", "AWAY", "RETURNING"} <= set(states)


def test_missing_end_sensor_aborts_with_fault(cell):
    plc, action = cell
    plc.break_station_sensor("white", "away")

    box = _send(action)

    assert not box["result"].result.success
    assert box["result"].result.final_state == "FAULT"
    assert box["result"].result.fault == 1


def test_exchange_while_away_is_aborted_without_a_command(cell):
    plc, action = cell
    plc.set_station_state("white", StationState.AWAY)

    box = _send(action)

    assert not box["result"].result.success
    assert box["result"].result.final_state == "AWAY"
