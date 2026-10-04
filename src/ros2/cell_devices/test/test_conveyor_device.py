"""ConveyorDevice against an in-process virtual_plc: intents out, status and latched counts in."""

import socket
import time

import pytest
from cell_devices.belt_sim import BeltParams
from cell_devices.conveyor import ConveyorDevice
from cell_devices.modbus_adapter import ModbusFieldIo
from cell_devices.register_map import BeltState, StationState
from cell_devices.virtual_plc import VirtualPlcServer

FAST = BeltParams(speed_mm_s=2000.0, accel_mm_s2=20000.0)


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture
def plc_and_device():
    port = _free_port()
    plc = VirtualPlcServer("127.0.0.1", port, belt=FAST)
    plc.start()
    io = ModbusFieldIo("127.0.0.1", port)
    io.connect()
    device = ConveyorDevice(io, counts_per_mm=FAST.counts_per_mm)
    yield plc, device
    io.close()
    plc.stop()


def _poll_until(device, predicate, timeout=5.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        status = device.poll()
        if predicate(status):
            return status
        time.sleep(0.02)
    raise AssertionError(f"timed out, last status {status}")


def test_run_to_pickzone_reports_acked_stop_at_the_eye(plc_and_device):
    plc, device = plc_and_device
    plc.add_belt_item(at_mm=0.0)

    device.run_to_pickzone()
    status = _poll_until(device, lambda s: s.acked and s.state == BeltState.STOPPED_AT_EYE)

    assert status.stop_reason == "STOPPED_AT_EYE"
    assert status.encoder_mm > 0


def test_stop_intent_settles_to_idle_once_acked(plc_and_device):
    _, device = plc_and_device

    device.stop()

    assert _poll_until(device, lambda s: s.acked).state == BeltState.IDLE


def test_exit_counts_accumulate_across_slow_polls_and_16_bit_wraps(plc_and_device):
    plc, device = plc_and_device
    plc.preset_exit_count(0xFFFE)  # about to wrap
    device = ConveyorDevice(device._io, counts_per_mm=FAST.counts_per_mm)
    for i in range(5):
        plc.add_belt_item(at_mm=-50.0 * i)

    device.flush()
    time.sleep(1.5)  # no polls during the whole flush
    status = _poll_until(device, lambda s: s.acked and s.state == BeltState.FLUSH_DONE)

    assert status.exit_count_total == 5
    assert device.poll().exit_count_total == 5  # idempotent


def test_run_reports_held_bin_away(plc_and_device):
    plc, device = plc_and_device
    plc.set_station_state("scrap", StationState.AWAY)

    device.run_to_pickzone()
    status = _poll_until(device, lambda s: s.acked)

    assert status.state == BeltState.HELD_BIN_AWAY
    assert status.stop_reason == "HELD_BIN_AWAY"


def test_each_intent_uses_a_fresh_sequence_number(plc_and_device):
    plc, device = plc_and_device
    plc.add_belt_item(at_mm=0.0)
    plc.add_belt_item(at_mm=-400.0)
    device.run_to_pickzone()
    _poll_until(device, lambda s: s.acked and s.state == BeltState.STOPPED_AT_EYE)

    device.run_to_pickzone()  # same command word as before: only a new seq makes it a new intent
    status = _poll_until(device, lambda s: s.acked and s.state == BeltState.STOPPED_AT_EYE)

    assert status.encoder_mm > 400.0
