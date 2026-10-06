"""ConveyorDevice: belt intents and status over a FieldIoPort (no ROS dependency)."""

from dataclasses import dataclass

from cell_devices.field_io import FieldIoPort
from cell_devices.register_map import (
    HOLDING,
    INPUT,
    STATIONS,
    BeltCmd,
    BeltState,
    CellCmd,
    FeederState,
    Interlock,
    StationState,
)

_SEQ_MOD = 2**16
_COUNTER_MOD = 2**16

_STOP_REASON = {
    BeltState.STOPPED_AT_EYE: "STOPPED_AT_EYE",
    BeltState.FLUSH_DONE: "FLUSH_DONE",
    BeltState.HELD_BIN_AWAY: "HELD_BIN_AWAY",
    BeltState.IDLE: "STOPPED",
    BeltState.FAULT: "FAULT",
}


@dataclass(frozen=True)
class ConveyorStatus:
    state: BeltState
    encoder_mm: float
    exit_count_total: int  # unwrapped, since this device was created
    acked: bool  # the controller has executed the latest intent
    belt_fault: int = 0  # drive fault code while FAULT
    interlocks: Interlock = Interlock(0)  # the cell-wide word; this node owns the cell block

    @property
    def settled(self) -> bool:
        return self.state != BeltState.RUNNING

    @property
    def stop_reason(self) -> str:
        return _STOP_REASON.get(self.state, "")


class ConveyorDevice:
    """ROS only writes intents and reads status: stops and counting happen in the controller."""

    def __init__(self, io: FieldIoPort, counts_per_mm: float) -> None:
        self._io = io
        self._counts_per_mm = counts_per_mm
        self._seq = io.read_holding(HOLDING["belt_seq"], 1)[0]
        self._last_exit_raw = io.read_input(INPUT["exit_count"], 1)[0]
        self._exit_total = 0
        self._cell_seq = io.read_holding(HOLDING["cell_seq"], 1)[0]

    def run_to_pickzone(self) -> None:
        self._send(BeltCmd.RUN_TO_PICKZONE)

    def flush(self) -> None:
        self._send(BeltCmd.FLUSH)

    def stop(self) -> None:
        self._send(BeltCmd.STOP)

    def finish_run(self) -> None:
        self._send(BeltCmd.FINISH_RUN)

    def freeze(self) -> None:
        """Cell-wide FREEZE (EmergencyStop): every drive and valve motion stops at once."""
        self._send_cell(CellCmd.FREEZE)

    def release_freeze(self) -> None:
        self._send_cell(CellCmd.RELEASE_FREEZE)

    def fault_ack(self) -> None:
        """Clears latched device faults; a faulted station drives back HOME by itself."""
        self._send_cell(CellCmd.FAULT_ACK)

    def recovered(self) -> bool:
        """After FAULT_ACK: acked, no device in FAULT and every station HOME."""
        if self._io.read_input(INPUT["cell_ack_seq"], 1)[0] != self._cell_seq:
            return False
        first, last = INPUT["belt_state"], INPUT["interlocks"]
        words = self._io.read_input(first, last - first + 1)
        reg = {name: words[addr - first] for name, addr in INPUT.items() if first <= addr <= last}
        return (
            reg["belt_state"] != BeltState.FAULT
            and reg["feeder_state"] != FeederState.FAULT
            and all(reg[f"station_{s}_state"] == StationState.HOME for s in STATIONS)
        )

    def poll(self) -> ConveyorStatus:
        first = INPUT["belt_state"]
        last = INPUT["belt_fault"]
        words = self._io.read_input(first, last - first + 1)
        (interlocks,) = self._io.read_input(INPUT["interlocks"], 1)
        reg = {name: words[addr - first] for name, addr in INPUT.items() if first <= addr <= last}

        self._exit_total += (reg["exit_count"] - self._last_exit_raw) % _COUNTER_MOD
        self._last_exit_raw = reg["exit_count"]
        counts = reg["encoder_hi"] << 16 | reg["encoder_lo"]
        return ConveyorStatus(
            state=BeltState(reg["belt_state"]),
            encoder_mm=counts / self._counts_per_mm,
            exit_count_total=self._exit_total,
            acked=reg["belt_ack_seq"] == self._seq,
            belt_fault=reg["belt_fault"],
            interlocks=Interlock(interlocks),
        )

    def _send(self, cmd: BeltCmd) -> None:
        self._seq = self._seq % (_SEQ_MOD - 1) + 1  # 1..65535, never 0
        self._io.write_holding(HOLDING["belt_cmd"], [int(cmd), self._seq])

    def _send_cell(self, cmd: CellCmd) -> None:
        self._cell_seq = self._cell_seq % (_SEQ_MOD - 1) + 1
        self._io.write_holding(HOLDING["cell_cmd"], [int(cmd), self._cell_seq])
