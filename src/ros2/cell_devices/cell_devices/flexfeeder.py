"""FlexFeederDevice: feeder intents and status over a FieldIoPort (no ROS dependency)."""

from dataclasses import dataclass

from cell_devices.field_io import FieldIoPort
from cell_devices.register_map import (
    COLOR_CODES,
    HOLDING,
    INPUT,
    RING_BASE,
    RING_ENTRIES,
    RING_WORDS,
    FeederCmd,
    FeederState,
)

_SEQ_MOD = 2**16


@dataclass(frozen=True)
class PlacementRecord:
    seq: int
    lateral_x_mm: int
    encoder_mm: float
    color: str
    intact: bool


@dataclass(frozen=True)
class FeederStatus:
    state: FeederState
    remaining: int
    acked: bool  # the controller has executed the latest intent
    fault: int  # module fault code while FAULT
    new_placements: list[PlacementRecord]  # each placement is reported exactly once, in order


class FlexFeederDevice:
    """ROS only writes intents and reads status: spacing and placement happen in the controller."""

    def __init__(self, io: FieldIoPort, counts_per_mm: float = 10.0) -> None:
        self._io = io
        self._counts_per_mm = counts_per_mm
        self._seq = io.read_holding(HOLDING["feeder_seq"], 1)[0]
        # Placements already on the belt before this device attached are not replayed.
        self._last_placement_seq = io.read_input(INPUT["placement_count"], 1)[0]

    def enable(self) -> None:
        self._send(FeederCmd.ENABLE)

    def disable(self) -> None:
        self._send(FeederCmd.DISABLE)

    def quick_empty(self) -> None:
        self._send(FeederCmd.QUICK_EMPTY)

    def fill(self, seed: int = 0) -> None:
        """`seed` is SIM only (fill_seed register); 0 means the controller picks one."""
        self._io.write_holding(HOLDING["fill_seed"], [seed % _SEQ_MOD])
        self._send(FeederCmd.FILL)

    def poll(self) -> FeederStatus:
        first = INPUT["feeder_state"]
        last = INPUT["feeder_fault"]
        words = self._io.read_input(first, last - first + 1)
        reg = {name: words[addr - first] for name, addr in INPUT.items() if first <= addr <= last}
        return FeederStatus(
            state=FeederState(reg["feeder_state"]),
            remaining=reg["remaining"],
            acked=reg["feeder_ack_seq"] == self._seq,
            fault=reg["feeder_fault"],
            new_placements=self._read_new_placements(reg["placement_count"]),
        )

    def _read_new_placements(self, count: int) -> list[PlacementRecord]:
        new = (count - self._last_placement_seq) % _SEQ_MOD
        if new == 0:
            return []
        # The ring holds the newest RING_ENTRIES; a poller further behind loses the oldest.
        take = min(new, RING_ENTRIES)
        first_seq = (count - take + 1) % _SEQ_MOD
        words = self._io.read_input(RING_BASE, RING_ENTRIES * RING_WORDS)
        records = []
        for i in range(take):
            seq = (first_seq + i) % _SEQ_MOD
            slot = seq % RING_ENTRIES
            w = words[slot * RING_WORDS : (slot + 1) * RING_WORDS]
            if w[0] != seq:  # overwritten or not yet published
                continue
            lateral = w[1] - _SEQ_MOD if w[1] >= _SEQ_MOD // 2 else w[1]
            records.append(
                PlacementRecord(
                    seq=seq,
                    lateral_x_mm=lateral,
                    encoder_mm=(w[2] << 16 | w[3]) / self._counts_per_mm,
                    color=COLOR_CODES[w[4]],
                    intact=bool(w[5]),
                )
            )
        self._last_placement_seq = count
        return records

    def _send(self, cmd: FeederCmd) -> None:
        self._seq = self._seq % (_SEQ_MOD - 1) + 1  # 1..65535, never 0
        self._io.write_holding(HOLDING["feeder_cmd"], [int(cmd), self._seq])
