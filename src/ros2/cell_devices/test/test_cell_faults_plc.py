"""virtual_plc completes the register map (hand-sim-7kss): interlocks, FAULT_ACK, injected
feeder and drive faults, and the Pallet stop gate, all observed over Modbus TCP."""

import socket
import time

import pytest
from cell_devices.belt_sim import BeltParams
from cell_devices.modbus_adapter import ModbusFieldIo
from cell_devices.register_map import (
    HOLDING,
    INPUT,
    BeltCmd,
    BeltState,
    CellCmd,
    FeederCmd,
    FeederState,
    Interlock,
    StationState,
)
from cell_devices.station_sim import StationParams
from cell_devices.virtual_plc import VirtualPlcServer

FAST = BeltParams(speed_mm_s=2000.0, accel_mm_s2=20000.0)
QUICK = StationParams(leave_s=0.2, away_s=0.2, return_s=0.2)
ALL_OK = Interlock.BIN_HOME | Interlock.FEEDER_OK | Interlock.DRIVES_OK | Interlock.ESTOP_CHAIN_OK


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture
def rig():
    port = _free_port()
    plc = VirtualPlcServer(
        "127.0.0.1",
        port,
        belt=FAST,
        stations={s: QUICK for s in ("white", "green", "blue", "scrap")},
    )
    plc.start()
    io = ModbusFieldIo("127.0.0.1", port)
    io.connect()
    yield plc, io
    io.close()
    plc.stop()


def _read(io, name: str) -> int:
    return io.read_input(INPUT[name], 1)[0]


def _until(pred, timeout=3.0) -> bool:
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if pred():
            return True
        time.sleep(0.02)
    return False


def _cell(io, cmd: CellCmd, seq: int) -> None:
    io.write_holding(HOLDING["cell_cmd"], [int(cmd), seq])
    assert _until(lambda: _read(io, "cell_ack_seq") == seq), "cell command never acked"


def test_interlocks_are_all_ok_at_rest(rig):
    _, io = rig
    assert _until(lambda: Interlock(_read(io, "interlocks")) == ALL_OK)


def test_bin_home_drops_while_the_scrap_station_is_away(rig):
    _, io = rig
    io.write_holding(HOLDING["station_scrap_cmd"], [1, 1])
    assert _until(lambda: not Interlock(_read(io, "interlocks")) & Interlock.BIN_HOME)
    assert _until(lambda: Interlock(_read(io, "interlocks")) & Interlock.BIN_HOME)


def test_an_injected_drive_fault_stops_the_belt_and_refuses_runs(rig):
    plc, io = rig
    io.write_holding(HOLDING["belt_cmd"], [int(BeltCmd.FLUSH), 1])
    plc.add_belt_item(at_mm=0.0)
    assert _until(lambda: _read(io, "belt_state") == BeltState.RUNNING)

    plc.inject_drive_fault(7)

    assert _until(lambda: _read(io, "belt_state") == BeltState.FAULT)
    assert _read(io, "belt_fault") == 7
    assert not Interlock(_read(io, "interlocks")) & Interlock.DRIVES_OK
    stopped = plc.encoder_counts
    io.write_holding(HOLDING["belt_cmd"], [int(BeltCmd.RUN_TO_PICKZONE), 2])
    time.sleep(0.2)
    assert (_read(io, "belt_state"), plc.encoder_counts) == (BeltState.FAULT, stopped)


def test_an_injected_feeder_fault_stops_placing(rig):
    plc, io = rig
    io.write_holding(HOLDING["feeder_cmd"], [int(FeederCmd.FILL), 1])
    assert _until(lambda: _read(io, "feeder_state") == FeederState.READY)

    plc.inject_feeder_fault(3)

    assert _until(lambda: _read(io, "feeder_state") == FeederState.FAULT)
    assert _read(io, "feeder_fault") == 3
    assert not Interlock(_read(io, "interlocks")) & Interlock.FEEDER_OK


def test_an_open_estop_chain_clears_its_interlock_bit(rig):
    plc, io = rig
    plc.set_estop_chain(ok=False)
    assert _until(lambda: not Interlock(_read(io, "interlocks")) & Interlock.ESTOP_CHAIN_OK)
    plc.set_estop_chain(ok=True)
    assert _until(lambda: Interlock(_read(io, "interlocks")) == ALL_OK)


def test_fault_ack_clears_drive_and_feeder_faults(rig):
    plc, io = rig
    io.write_holding(HOLDING["feeder_cmd"], [int(FeederCmd.FILL), 1])
    assert _until(lambda: _read(io, "feeder_state") == FeederState.READY)
    plc.inject_drive_fault(7)
    plc.inject_feeder_fault(3)
    assert _until(lambda: _read(io, "feeder_state") == FeederState.FAULT)

    _cell(io, CellCmd.FAULT_ACK, 1)

    assert _until(lambda: Interlock(_read(io, "interlocks")) == ALL_OK)
    assert (_read(io, "belt_state"), _read(io, "belt_fault")) == (BeltState.IDLE, 0)
    assert (_read(io, "feeder_state"), _read(io, "feeder_fault")) == (FeederState.READY, 0)


def test_fault_ack_returns_a_faulted_station_home(rig):
    plc, io = rig
    plc.break_station_sensor("green", "away")
    io.write_holding(HOLDING["station_green_cmd"], [1, 1])
    assert _until(lambda: _read(io, "station_green_state") == StationState.FAULT)
    plc.repair_station_sensor("green", "away")

    _cell(io, CellCmd.FAULT_ACK, 1)

    assert _until(lambda: _read(io, "station_green_state") == StationState.HOME)
    assert _read(io, "station_green_fault") == 0


def test_the_pallet_stop_gate_holds_a_pallet_without_exchange(rig):
    _, io = rig
    for cmd, seq in ((int(CellCmd.RELEASE_FREEZE), 1), (int(CellCmd.FAULT_ACK), 2)):
        _cell(io, CellCmd(cmd), seq)
    io.write_holding(HOLDING["station_white_cmd"], [0, 1])  # a new sequence but no EXCHANGE
    time.sleep(0.3)
    assert _read(io, "station_white_state") == StationState.HOME
