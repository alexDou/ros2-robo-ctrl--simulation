"""Seam test: ModbusFieldIo <-> virtual_plc over an in-process Modbus TCP server."""

import socket
import time

import pytest
from cell_devices.modbus_adapter import ModbusFieldIo
from cell_devices.register_map import HOLDING, INPUT, MAP_VERSION
from cell_devices.virtual_plc import VirtualPlcServer


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture
def field_io():
    port = _free_port()
    plc = VirtualPlcServer("127.0.0.1", port)
    plc.start()
    io = ModbusFieldIo("127.0.0.1", port)
    io.connect()
    yield io
    io.close()
    plc.stop()


def _wait_for(read, expected, timeout=2.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if read() == expected:
            return True
        time.sleep(0.02)
    return False


def test_controller_reports_map_version(field_io):
    assert field_io.read_input(INPUT["map_version"], 1) == [MAP_VERSION]


def test_command_word_and_sequence_are_echoed_as_ack_seq(field_io):
    field_io.write_holding(HOLDING["belt_cmd"], [1, 7])  # RUN_TO_PICKZONE, seq 7

    assert field_io.read_holding(HOLDING["belt_cmd"], 2) == [1, 7]
    assert _wait_for(lambda: field_io.read_input(INPUT["belt_ack_seq"], 1), [7])


@pytest.mark.parametrize(
    ("seq_name", "ack_name"),
    [
        ("feeder_seq", "feeder_ack_seq"),
        ("station_white_seq", "station_white_ack_seq"),
        ("station_scrap_seq", "station_scrap_ack_seq"),
        ("cell_seq", "cell_ack_seq"),
    ],
)
def test_every_sequence_register_has_a_matching_ack(field_io, seq_name, ack_name):
    field_io.write_holding(HOLDING[seq_name], [42])

    assert _wait_for(lambda: field_io.read_input(INPUT[ack_name], 1), [42])
