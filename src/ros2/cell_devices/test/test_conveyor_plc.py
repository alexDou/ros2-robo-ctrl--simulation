"""virtual_plc Conveyor block over Modbus TCP (controller-local behaviour, hermetic)."""

import socket
import time

import pytest
from cell_devices.belt_sim import BeltParams
from cell_devices.modbus_adapter import ModbusFieldIo
from cell_devices.register_map import HOLDING, INPUT, BeltCmd, BeltState, StationState
from cell_devices.virtual_plc import VirtualPlcServer

FAST = BeltParams(speed_mm_s=2000.0, accel_mm_s2=20000.0)


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture
def plc_and_io():
    port = _free_port()
    plc = VirtualPlcServer("127.0.0.1", port, belt=FAST)
    plc.start()
    io = ModbusFieldIo("127.0.0.1", port)
    io.connect()
    yield plc, io
    io.close()
    plc.stop()


def _belt_state(io) -> BeltState:
    return BeltState(io.read_input(INPUT["belt_state"], 1)[0])


def _wait_state(io, expected, timeout=5.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if _belt_state(io) == expected:
            return
        time.sleep(0.02)
    raise AssertionError(f"belt never reached {expected.name}, is {_belt_state(io).name}")


def _command(io, cmd: BeltCmd, seq: int) -> None:
    io.write_holding(HOLDING["belt_cmd"], [int(cmd), seq])


def test_belt_stops_at_the_eye_with_no_ros_involvement(plc_and_io):
    plc, io = plc_and_io
    plc.add_belt_item(at_mm=0.0)

    _command(io, BeltCmd.RUN_TO_PICKZONE, 1)  # one write; nothing else is sent afterwards

    _wait_state(io, BeltState.STOPPED_AT_EYE)
    assert io.read_input(INPUT["belt_ack_seq"], 1) == [1]


def test_encoder_is_reported_as_hi_lo_words(plc_and_io):
    plc, io = plc_and_io
    plc.add_belt_item(at_mm=0.0)
    _command(io, BeltCmd.RUN_TO_PICKZONE, 1)
    _wait_state(io, BeltState.STOPPED_AT_EYE)

    hi, lo = io.read_input(INPUT["encoder_hi"], 2)

    assert (hi << 16 | lo) == plc.encoder_counts > 0


def test_exit_counts_survive_a_slow_poller(plc_and_io):
    plc, io = plc_and_io
    for i in range(5):
        plc.add_belt_item(at_mm=-50.0 * i)

    _command(io, BeltCmd.FLUSH, 1)
    time.sleep(1.5)  # a poller asleep through the whole flush

    assert _belt_state(io) == BeltState.FLUSH_DONE
    assert io.read_input(INPUT["exit_count"], 1) == [5]


@pytest.mark.parametrize("cmd", [BeltCmd.RUN_TO_PICKZONE, BeltCmd.FLUSH])
def test_belt_refuses_while_scrap_station_is_away(plc_and_io, cmd):
    plc, io = plc_and_io
    plc.add_belt_item(at_mm=0.0)
    plc.set_station_state("scrap", StationState.AWAY)

    _command(io, cmd, 1)

    _wait_state(io, BeltState.HELD_BIN_AWAY)
    time.sleep(0.2)
    assert plc.encoder_counts == 0
    assert io.read_input(INPUT["belt_ack_seq"], 1) == [1]


def test_same_sequence_is_not_executed_twice(plc_and_io):
    plc, io = plc_and_io
    plc.add_belt_item(at_mm=0.0)
    plc.add_belt_item(at_mm=-500.0)
    _command(io, BeltCmd.RUN_TO_PICKZONE, 1)
    _wait_state(io, BeltState.STOPPED_AT_EYE)

    time.sleep(0.2)  # controller keeps ticking with the old command word still latched

    assert _belt_state(io) == BeltState.STOPPED_AT_EYE
