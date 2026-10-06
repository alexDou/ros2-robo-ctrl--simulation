"""Flush reset (RESETTING): a physical flush, the same in SIM and LIVE.

A step machine the Cell event loop advances on every event:
DRAIN    the in-flight SortCycle and exchanges complete, the belt run is cancelled, and a
         Gearwheel left in the DexterousPalm (EmergencyStop) is finished onto its Pallet (D32)
FLUSH    freeze released (after FAULT), FlexFeeder quick-empties, belt FLUSH into the bin
EXCHANGE every Pallet with Gearwheels and the ScrapBin if it holds any leave together
then WorkcellNode clears and the cell is EMPTY. The first failure faults the cell.
"""

from enum import Enum, auto
from typing import TYPE_CHECKING

from robot_control_interfaces.action import ConveyorRun

from cell_orchestrator.cell_model import BIN, PALLET_COLORS

if TYPE_CHECKING:
    from cell_orchestrator.cell import Cell


class _Step(Enum):
    DRAIN = auto()
    FLUSH = auto()
    EXCHANGE = auto()


class FlushReset:
    def __init__(self, cell: "Cell", was_fault: bool) -> None:
        self._cell = cell
        self._was_fault = was_fault
        self._step = _Step.DRAIN

    def start(self) -> None:
        self._cell.ports.cancel_belt()
        self.advance()

    def advance(self) -> None:
        """Called on every event the reset may be waiting for."""
        cell = self._cell
        if self._step is _Step.DRAIN and not cell.busy():
            if cell.held is not None:
                cell.place_held()  # back here through the cycle's result
            else:
                self._flush()
        elif self._step is _Step.EXCHANGE and not cell.exchanging:
            self._clear()

    def on_belt_done(self, result: ConveyorRun.Result | None) -> None:
        """The cancelled run ended (DRAIN) or the flush did (FLUSH)."""
        if self._step is _Step.FLUSH:
            self._on_flush_done(result)
        else:
            self.advance()

    def _on_flush_done(self, result: ConveyorRun.Result | None) -> None:
        if result is None or not result.success or result.stop_reason != "FLUSH_DONE":
            self._cell.fault("conveyor", "FLUSH_FAILED")
            return
        self._step = _Step.EXCHANGE
        model = self._cell.model
        for name in (*PALLET_COLORS, BIN):
            if model.counts[name] > 0:
                self._cell.start_exchange(name)
        self.advance()

    def _flush(self) -> None:
        cell = self._cell
        # Only now: the frozen belt must not resume its old run command.
        if self._was_fault and not cell.ports.release_freeze():
            cell.fault("conveyor", "RELEASE_FAILED")
            return
        if not cell.ports.quick_empty_feeder():
            cell.fault("feeder", "QUICK_EMPTY_FAILED")
            return
        self._step = _Step.FLUSH
        cell.start_belt(ConveyorRun.Goal.FLUSH)

    def _clear(self) -> None:
        if not self._cell.ports.clear_workspace():
            self._cell.fault("workcell", "CLEAR_FAILED")
            return
        self._cell.finish_reset()
