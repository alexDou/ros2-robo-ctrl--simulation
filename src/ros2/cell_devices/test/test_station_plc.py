"""virtual_plc station blocks and StationDevice: exchange sequence, interlock, end-sensor FAULT."""

import socket
import time

import pytest
from cell_devices.modbus_adapter import ModbusFieldIo
from cell_devices.register_map import STATIONS, StationState
from cell_devices.station import StationDevice
from cell_devices.station_sim import (
    BIN_EXCHANGE,
    FAULT_AWAY_SENSOR,
    FAULT_HOME_SENSOR,
    PALLET_EXCHANGE,
    StationParams,
    StationSim,
)
from cell_devices.virtual_plc import VirtualPlcServer

QUICK = StationParams(leave_s=0.1, away_s=0.1, return_s=0.1)


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture
def rig():
    port = _free_port()
    plc = VirtualPlcServer("127.0.0.1", port, stations=dict.fromkeys(STATIONS, QUICK))
    plc.start()
    io = ModbusFieldIo("127.0.0.1", port)
    io.connect()
    yield plc, {name: StationDevice(io, name) for name in STATIONS}
    io.close()
    plc.stop()


def _collect_states(device, until, timeout=5.0):
    """Distinct consecutive states seen while polling until `until(status)`."""
    seen: list[StationState] = []
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        status = device.poll()
        # Before the controller's next tick the command is unacked and the state is stale.
        if status.acked and (not seen or seen[-1] != status.state):
            seen.append(status.state)
        if until(status):
            return seen, status
        time.sleep(0.005)
    raise AssertionError(f"condition not met, saw {seen}")


def test_nominal_durations_match_the_spec():
    assert PALLET_EXCHANGE.exchange_s == pytest.approx(6.0)
    assert BIN_EXCHANGE.exchange_s == pytest.approx(8.0)


@pytest.mark.parametrize("name", STATIONS)
def test_exchange_walks_home_leaving_away_returning_home(rig, name):
    _, devices = rig
    device = devices[name]
    assert device.poll().state == StationState.HOME

    device.exchange()

    seen, status = _collect_states(device, lambda s: s.acked and s.state == StationState.HOME)
    assert seen == [
        StationState.LEAVING,
        StationState.AWAY,
        StationState.RETURNING,
        StationState.HOME,
    ]
    assert status.fault == 0


def test_stations_exchange_independently(rig):
    _, devices = rig
    devices["white"].exchange()
    devices["scrap"].exchange()

    _collect_states(devices["white"], lambda s: s.acked and s.settled)
    _collect_states(devices["scrap"], lambda s: s.acked and s.settled)
    assert devices["green"].poll().state == StationState.HOME
    assert devices["green"].poll().acked


def test_exchange_while_not_home_is_ignored_but_acked(rig):
    plc, devices = rig
    plc.set_station_state("blue", StationState.AWAY)

    devices["blue"].exchange()

    status = _collect_states(devices["blue"], lambda s: s.acked)[1]
    assert status.state == StationState.AWAY


@pytest.mark.parametrize(
    ("end", "fault", "stuck_in"),
    [
        ("away", FAULT_AWAY_SENSOR, StationState.LEAVING),
        ("home", FAULT_HOME_SENSOR, StationState.RETURNING),
    ],
)
def test_missing_end_sensor_faults_after_the_timeout(rig, end, fault, stuck_in):
    plc, devices = rig
    plc.break_station_sensor("green", end)

    devices["green"].exchange()

    seen, status = _collect_states(devices["green"], lambda s: s.state == StationState.FAULT)
    assert seen[-2] == stuck_in
    assert status.fault == fault


def test_fault_is_latched_and_refuses_a_new_exchange():
    sim = StationSim(QUICK)
    sim.break_sensor("away")
    sim.exchange()
    for _ in range(100):
        sim.step(0.01)
    assert sim.state == StationState.FAULT

    sim.exchange()
    sim.step(1.0)

    assert sim.state == StationState.FAULT


def test_fault_waits_for_the_timeout_not_just_the_leg_time():
    sim = StationSim(StationParams(leave_s=1.0, away_s=1.0, return_s=1.0, timeout_factor=2.0))
    sim.break_sensor("away")
    sim.exchange()

    sim.step(1.5)
    assert sim.state == StationState.LEAVING
    sim.step(0.6)
    assert sim.state == StationState.FAULT


def test_unknown_sensor_name_is_rejected():
    with pytest.raises(ValueError):
        StationSim(QUICK).break_sensor("middle")
