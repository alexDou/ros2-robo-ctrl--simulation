"""EdgeNode maps CELL_FILL / CELL_PROCESS / CELL_STOP onto the orchestrator and forwards cell/state.

Unit 9.05/9.07: real cell_orchestrator + ConveyorNode + FlexFeederNode + in-process virtual_plc,
so CELL_FILL / CELL_PROCESS visibly run the SIM feeder and belt end to end below the EdgeNode.
"""

import socket
import threading
import time

import pytest
from arm_controller.edge_bridge_node import EdgeBridgeNode
from cell_devices.belt_sim import BeltParams
from cell_devices.conveyor_node import ConveyorNode
from cell_devices.feeder_sim import FeederParams
from cell_devices.flexfeeder_node import FlexFeederNode
from cell_devices.virtual_plc import VirtualPlcServer
from cell_orchestrator.orchestrator_node import CellOrchestratorNode
from rclpy.executors import MultiThreadedExecutor
from rclpy.parameter import Parameter
from workcell_manager.workcell_node import WorkcellNode

from domain import PICK_ZONE_Y_RANGE, CommandType, ConveyorStatus, RobotCommand, RobotState

FAST = BeltParams(speed_mm_s=2000.0, accel_mm_s2=20000.0)
QUICK_FEEDER = FeederParams(cycle_s_range=(0.05, 0.1), emptying_s=0.0)


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _command(command_type: CommandType, command_id: str) -> RobotCommand:
    return RobotCommand(
        command_id=command_id,
        sender_id="ui-client",
        timestamp_ns=time.time_ns(),
        type=command_type,
        payload={},
    )


def _wait_for(pred, timeout=8.0):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if pred():
            return True
        time.sleep(0.02)
    return False


def _make_edge(executor, make_switch_server):
    node = EdgeBridgeNode(
        parameter_overrides=[
            Parameter("auto_home_on_startup", Parameter.Type.BOOL, False),
            Parameter("auto_connect_zenoh", Parameter.Type.BOOL, False),
            Parameter("switch_timeout", Parameter.Type.DOUBLE, 0.1),
        ]
    )
    executor.add_node(node)
    make_switch_server(executor)
    node.errors = []
    node._publish_error = lambda code, msg: node.errors.append((code, msg))  # type: ignore[method-assign]
    return node


def _engage(executor, node):
    """Spins the executor, then runs the ENGAGE handshake (needs the fake switch server alive)."""
    threading.Thread(target=executor.spin, daemon=True).start()
    node.handle_command(_command(CommandType.ENGAGE, "engage"))
    assert node.robot_state == RobotState.IDLE


@pytest.fixture
def edge(make_switch_server):
    port = _free_port()
    plc = VirtualPlcServer("127.0.0.1", port, belt=FAST, feeder=QUICK_FEEDER)
    plc.start()
    executor = MultiThreadedExecutor(num_threads=8)
    nodes = [
        ConveyorNode(
            parameter_overrides=[
                Parameter("port", value=port),
                Parameter("counts_per_mm", value=FAST.counts_per_mm),
                Parameter("poll_hz", value=50.0),
            ]
        ),
        FlexFeederNode(
            parameter_overrides=[
                Parameter("port", value=port),
                Parameter("counts_per_mm", value=FAST.counts_per_mm),
                Parameter("poll_hz", value=50.0),
            ]
        ),
        CellOrchestratorNode(),
        WorkcellNode(),
    ]
    for n in nodes:
        executor.add_node(n)
    node = _make_edge(executor, make_switch_server)
    _engage(executor, node)
    assert _wait_for(lambda: node._cell_process_client.service_is_ready())
    node.workcell = nodes[-1]
    yield node, plc
    executor.shutdown()
    node.close()
    for n in (node, *nodes):
        n.destroy_node()
    plc.stop()


def _fill(node):
    node.handle_command(_command(CommandType.CELL_FILL, "cell-fill"))
    assert _wait_for(lambda: _cell_status(node) == ConveyorStatus.LOADED)


def _cell_status(node):
    cell = node.publish_telemetry().cell_state
    return None if cell is None else cell.conveyor_status


def test_telemetry_carries_initial_cell_state(edge):
    node, _ = edge
    assert _wait_for(lambda: _cell_status(node) == ConveyorStatus.EMPTY)


def test_cell_fill_loads_the_feeder_and_telemetry_reports_remaining(edge):
    node, _ = edge
    assert _wait_for(lambda: _cell_status(node) == ConveyorStatus.EMPTY)

    node.handle_command(_command(CommandType.CELL_FILL, "cell-fill-1"))

    assert _wait_for(lambda: _cell_status(node) == ConveyorStatus.LOADED)
    assert _wait_for(lambda: node.publish_telemetry().cell_state.feeder_remaining == 100)
    assert node.errors == []


def test_cell_fill_is_refused_once_loaded(edge):
    node, _ = edge
    _fill(node)
    node.handle_command(_command(CommandType.CELL_FILL, "cell-fill-2"))
    assert _wait_for(lambda: any(code == "CELL_COMMAND_REFUSED" for code, _ in node.errors))


def test_cell_process_runs_sim_belt_and_telemetry_reports_it(edge):
    node, _ = edge
    _fill(node)
    node.handle_command(_command(CommandType.CELL_PROCESS, "cell-process-1"))
    assert _wait_for(lambda: _cell_status(node) == ConveyorStatus.HALTED)
    cell = node.publish_telemetry().cell_state
    assert cell.belt_offset_m > 0.0
    assert 0 < cell.feeder_remaining < 100  # the feeder placed Gearwheels on the way
    # the eye stop registered the Batch: every Gearwheel in the PickZone is pickable or Rejected
    registered = {e["id"]: e["intact"] for e in node.workcell.spawned + node.workcell.rejected}
    assert registered
    assert all(
        g.id in registered
        for g in cell.belt_gears
        if PICK_ZONE_Y_RANGE[0] <= g.y <= PICK_ZONE_Y_RANGE[1]
    )
    assert [e for e in node.workcell.spawned if not e["intact"]] == []
    assert [e for e in node.workcell.rejected if e["intact"]] == []
    assert node.errors == []


def test_cell_stop_freezes_the_belt(edge):
    node, _ = edge
    _fill(node)
    node.handle_command(_command(CommandType.CELL_PROCESS, "cell-process-2"))
    assert _wait_for(lambda: _cell_status(node) == ConveyorStatus.FEEDING)
    node.handle_command(_command(CommandType.CELL_STOP, "cell-stop-1"))
    assert _wait_for(lambda: _cell_status(node) == ConveyorStatus.STOPPED)
    time.sleep(0.6)  # the drive ramps down and the 5 Hz offset catches up
    frozen = node.publish_telemetry().cell_state.belt_offset_m
    time.sleep(0.5)
    assert node.publish_telemetry().cell_state.belt_offset_m == pytest.approx(frozen, abs=0.05)


def test_refused_cell_command_reports_error_frame(edge):
    node, _ = edge
    node.handle_command(_command(CommandType.CELL_STOP, "cell-stop-idle"))
    assert _wait_for(lambda: any(code == "CELL_COMMAND_REFUSED" for code, _ in node.errors))


def test_cell_command_without_orchestrator_reports_service_unavailable(make_switch_server):
    executor = MultiThreadedExecutor()
    node = _make_edge(executor, make_switch_server)
    _engage(executor, node)
    try:
        node.handle_command(_command(CommandType.CELL_PROCESS, "cell-process-x"))
        assert any(code == "SERVICE_UNAVAILABLE" for code, _ in node.errors)
    finally:
        executor.shutdown()
        node.close()
        node.destroy_node()
