"""StationDevice: exchange intent and status for one station over a FieldIoPort (no ROS)."""

from dataclasses import dataclass

from cell_devices.field_io import FieldIoPort
from cell_devices.register_map import HOLDING, INPUT, STATIONS, StationState

_SEQ_MOD = 2**16


@dataclass(frozen=True)
class StationStatus:
    state: StationState
    fault: int
    acked: bool  # the controller has executed the latest intent

    @property
    def settled(self) -> bool:
        return self.state in (StationState.HOME, StationState.FAULT)


class StationDevice:
    """ROS only writes the EXCHANGE intent and reads status: strokes and timeouts are controller-local."""

    def __init__(self, io: FieldIoPort, station: str) -> None:
        if station not in STATIONS:
            raise ValueError(f"unknown station {station!r}, expected one of {STATIONS}")
        self._io = io
        self._station = station
        self._seq = io.read_holding(HOLDING[f"station_{station}_seq"], 1)[0]

    def exchange(self) -> None:
        self._seq = self._seq % (_SEQ_MOD - 1) + 1  # 1..65535, never 0
        self._io.write_holding(HOLDING[f"station_{self._station}_cmd"], [1, self._seq])

    def poll(self) -> StationStatus:
        first = INPUT[f"station_{self._station}_state"]
        state, ack, fault = self._io.read_input(first, 3)
        return StationStatus(state=StationState(state), fault=fault, acked=ack == self._seq)
