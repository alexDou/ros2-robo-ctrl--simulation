"""Controller-local station exchange for virtual_plc: HOME -> LEAVING -> AWAY -> RETURNING -> HOME.

One machine serves the three PalletLanes and the ScrapBin slide + tipper. Pure and clock-free:
callers advance it with step(dt). An end sensor not reached within its timeout latches FAULT.
"""

from dataclasses import dataclass

from cell_devices.register_map import StationState

FAULT_NONE = 0
FAULT_AWAY_SENSOR = 1
FAULT_HOME_SENSOR = 2


@dataclass(frozen=True)
class StationParams:
    """Commissioning parameters (seconds); the operator never sets these."""

    leave_s: float
    away_s: float  # dwell at the outer end: Pallet unloaded by the next line / bin tipped
    return_s: float
    timeout_factor: float = 2.0  # an end sensor is late after leg time x this

    @property
    def exchange_s(self) -> float:
        return self.leave_s + self.away_s + self.return_s


PALLET_EXCHANGE = StationParams(leave_s=2.0, away_s=2.0, return_s=2.0)  # ~6 s
BIN_EXCHANGE = StationParams(leave_s=3.0, away_s=2.0, return_s=3.0)  # ~8 s


class StationSim:
    def __init__(self, params: StationParams) -> None:
        self.params = params
        self.state = StationState.HOME
        self.fault = FAULT_NONE
        self._elapsed = 0.0
        self._held = False
        self._dead_sensors: set[str] = set()

    def exchange(self) -> None:
        """EXCHANGE is accepted from HOME only; anywhere else it is ignored (still acked)."""
        if self.state == StationState.HOME:
            self.state = StationState.LEAVING
            self._elapsed = 0.0

    def break_sensor(self, end: str) -> None:
        """SIM seam: the `away` or `home` end sensor never trips."""
        if end not in ("away", "home"):
            raise ValueError(f"unknown end sensor {end!r}")
        self._dead_sensors.add(end)

    def force(self, state: StationState) -> None:
        """SIM seam: park the station in `state`; it stays there."""
        self.state = state
        self._held = True

    def step(self, dt: float) -> None:
        if self._held or self.state in (StationState.HOME, StationState.FAULT):
            return
        self._elapsed += dt
        p = self.params
        if self.state == StationState.LEAVING:
            self._leg(p.leave_s, "away", StationState.AWAY, FAULT_AWAY_SENSOR)
        elif self.state == StationState.AWAY:
            if self._elapsed >= p.away_s:
                self.state = StationState.RETURNING
                self._elapsed = 0.0
        elif self.state == StationState.RETURNING:
            self._leg(p.return_s, "home", StationState.HOME, FAULT_HOME_SENSOR)

    def _leg(self, leg_s: float, sensor: str, arrived: StationState, fault: int) -> None:
        if self._elapsed >= leg_s and sensor not in self._dead_sensors:
            self.state = arrived
            self._elapsed = 0.0
        elif self._elapsed >= leg_s * self.params.timeout_factor:
            self.state = StationState.FAULT
            self.fault = fault
