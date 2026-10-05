"""virtual_plc FlexFeeder block over Modbus TCP, and FlexFeederDevice against it."""

import socket
import time

import pytest
from cell_devices.belt_sim import BeltParams
from cell_devices.feeder_sim import FeederParams
from cell_devices.flexfeeder import FlexFeederDevice
from cell_devices.modbus_adapter import ModbusFieldIo
from cell_devices.register_map import BeltState, FeederState, StationState
from cell_devices.virtual_plc import VirtualPlcServer

BELT = BeltParams(speed_mm_s=600.0, accel_mm_s2=20000.0)
FEEDER = FeederParams(cycle_s_range=(0.05, 0.1), emptying_s=0.0)


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture
def rig():
    port = _free_port()
    plc = VirtualPlcServer("127.0.0.1", port, belt=BELT, feeder=FEEDER)
    plc.start()
    io = ModbusFieldIo("127.0.0.1", port)
    io.connect()
    from cell_devices.conveyor import ConveyorDevice

    yield plc, FlexFeederDevice(io), ConveyorDevice(io, BELT.counts_per_mm)
    io.close()
    plc.stop()


def _until(fn, predicate, timeout=8.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        value = fn()
        if predicate(value):
            return value
        time.sleep(0.02)
    raise AssertionError(f"condition not met, last: {value}")


def test_fill_loads_a_deck_and_reports_remaining(rig):
    _, feeder, _ = rig
    assert feeder.poll().state == FeederState.EMPTY

    feeder.fill(seed=4)

    status = _until(feeder.poll, lambda s: s.acked and s.remaining == 100)
    assert status.state == FeederState.READY


def test_places_gearwheels_only_while_the_belt_runs(rig):
    _, feeder, belt = rig
    feeder.fill(seed=1)
    _until(feeder.poll, lambda s: s.remaining == 100)
    feeder.enable()

    time.sleep(0.5)  # enabled but the belt is idle
    assert feeder.poll().remaining == 100

    belt.run_to_pickzone()
    status = _until(feeder.poll, lambda s: s.remaining < 100)
    assert status.state == FeederState.PLACING


def test_belt_stops_and_feeder_is_disabled_at_the_eye(rig):
    plc, feeder, belt = rig
    feeder.fill(seed=1)
    _until(feeder.poll, lambda s: s.remaining == 100)
    feeder.enable()
    belt.run_to_pickzone()

    _until(belt.poll, lambda s: s.state == BeltState.STOPPED_AT_EYE)
    left = feeder.poll().remaining
    time.sleep(0.4)

    assert feeder.poll().remaining == left  # nothing placed once stopped
    assert 0 < left < 100


def test_device_reads_each_placement_once_with_its_encoder_position(rig):
    _, feeder, belt = rig
    feeder.fill(seed=2)
    _until(feeder.poll, lambda s: s.remaining == 100)
    feeder.enable()
    belt.run_to_pickzone()
    _until(belt.poll, lambda s: s.state == BeltState.STOPPED_AT_EYE)

    seen = []
    for _ in range(3):  # repeated polls never duplicate records
        seen += feeder.poll().new_placements
    assert [p.seq for p in seen] == list(range(1, len(seen) + 1))
    assert len(seen) == 100 - feeder.poll().remaining
    spacing_mm = [(b.encoder_mm - a.encoder_mm) for a, b in zip(seen, seen[1:], strict=False)]
    assert all(gap >= 130.0 - 1e-6 for gap in spacing_mm)
    assert all(p.color in ("WHITE", "GREEN", "BLUE") for p in seen)


def test_placements_survive_a_slow_poller(rig):
    _, feeder, belt = rig
    feeder.fill(seed=2)
    _until(feeder.poll, lambda s: s.remaining == 100)
    feeder.enable()
    belt.run_to_pickzone()
    _until(belt.poll, lambda s: s.state == BeltState.STOPPED_AT_EYE)
    time.sleep(0.3)

    first = feeder.poll()

    assert len(first.new_placements) == 100 - first.remaining  # none dropped


def test_belt_held_while_bin_away_so_nothing_is_placed(rig):
    plc, feeder, belt = rig
    plc.set_station_state("scrap", StationState.AWAY)
    feeder.fill(seed=1)
    _until(feeder.poll, lambda s: s.remaining == 100)
    feeder.enable()
    belt.run_to_pickzone()

    time.sleep(0.5)

    assert feeder.poll().remaining == 100


def test_quick_empty_clears_the_deck(rig):
    _, feeder, _ = rig
    feeder.fill(seed=1)
    _until(feeder.poll, lambda s: s.remaining == 100)

    feeder.quick_empty()

    status = _until(feeder.poll, lambda s: s.acked and s.state == FeederState.EMPTY)
    assert status.remaining == 0
