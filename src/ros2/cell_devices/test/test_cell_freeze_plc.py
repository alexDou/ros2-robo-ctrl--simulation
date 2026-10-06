"""virtual_plc FREEZE: every drive and valve motion stops at once, RELEASE_FREEZE resumes."""

import socket
import time

import pytest
from cell_devices.belt_sim import BeltParams
from cell_devices.modbus_adapter import ModbusFieldIo
from cell_devices.register_map import HOLDING, INPUT, BeltCmd, CellCmd, StationState
from cell_devices.station_sim import StationParams
from cell_devices.virtual_plc import VirtualPlcServer

FAST = BeltParams(speed_mm_s=2000.0, accel_mm_s2=20000.0)
SLOW_STATION = StationParams(leave_s=0.4, away_s=0.4, return_s=0.4)


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture
def rig():
    port = _free_port()
    plc = VirtualPlcServer("127.0.0.1", port, belt=FAST, stations={"scrap": SLOW_STATION})
    plc.start()
    io = ModbusFieldIo("127.0.0.1", port)
    io.connect()
    yield plc, io
    io.close()
    plc.stop()


def _cell(io, cmd: CellCmd, seq: int) -> None:
    io.write_holding(HOLDING["cell_cmd"], [int(cmd), seq])
    deadline = time.monotonic() + 2.0
    while io.read_input(INPUT["cell_ack_seq"], 1)[0] != seq:
        assert time.monotonic() < deadline, "cell command never acked"
        time.sleep(0.02)


def test_freeze_stops_the_belt_at_once_and_release_resumes_it(rig):
    plc, io = rig
    io.write_holding(HOLDING["belt_cmd"], [int(BeltCmd.FLUSH), 1])
    plc.add_belt_item(at_mm=0.0)
    time.sleep(0.15)

    _cell(io, CellCmd.FREEZE, 1)
    frozen_at = plc.encoder_counts
    time.sleep(0.2)
    assert plc.encoder_counts == frozen_at

    _cell(io, CellCmd.RELEASE_FREEZE, 2)
    time.sleep(0.2)
    assert plc.encoder_counts > frozen_at


def test_freeze_holds_a_station_mid_exchange(rig):
    plc, io = rig
    io.write_holding(HOLDING["station_scrap_cmd"], [1, 1])
    time.sleep(0.1)
    _cell(io, CellCmd.FREEZE, 1)

    time.sleep(0.6)  # longer than the whole leave leg
    assert io.read_input(INPUT["station_scrap_state"], 1) == [int(StationState.LEAVING)]

    _cell(io, CellCmd.RELEASE_FREEZE, 2)
    time.sleep(0.6)
    assert io.read_input(INPUT["station_scrap_state"], 1)[0] != int(StationState.LEAVING)


def test_freeze_stops_the_feeder_placing(rig):
    plc, io = rig
    io.write_holding(HOLDING["feeder_cmd"], [3, 1])  # FILL
    time.sleep(0.1)
    io.write_holding(HOLDING["feeder_cmd"], [1, 2])  # ENABLE
    io.write_holding(HOLDING["belt_cmd"], [int(BeltCmd.RUN_TO_PICKZONE), 1])
    _cell(io, CellCmd.FREEZE, 1)
    count = io.read_input(INPUT["placement_count"], 1)[0]
    time.sleep(1.0)
    assert io.read_input(INPUT["placement_count"], 1)[0] == count
