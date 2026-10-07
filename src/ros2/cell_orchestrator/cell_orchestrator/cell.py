"""Cell: the orchestrator's single serialized state machine (D33).

Every operator intent, device result and status update is an event applied, in order, by one
loop thread that alone owns the CellModel. There is at most one belt run, one SortCycle and one
exchange per station in flight, so each result is matched to its operation by kind, not by a
run counter that could drop it. A device fault always ends in FAULT and a DEVICE_FAULT frame.
"""

import threading
from collections.abc import Callable
from typing import Any

from robot_control_interfaces.action import ConveyorRun

from cell_orchestrator.cell_model import BIN, CellModel, Pick
from cell_orchestrator.event_loop import EventLoop
from cell_orchestrator.flush_reset import FlushReset
from cell_orchestrator.ports import CellPorts
from cell_orchestrator.sort_cycle import CycleOutcome, run_place, run_sort_cycle
from domain import BIN_EXCHANGE_THRESHOLD, BeltGear, CellState, ConveyorStatus, ExchangeState

_FILL_FROM = (ConveyorStatus.EMPTY,)
_PROCESS_FROM = (ConveyorStatus.LOADED, ConveyorStatus.STOPPED)
_STOP_FROM = (ConveyorStatus.FEEDING, ConveyorStatus.HALTED)
_RUN = ConveyorRun.Goal.RUN_TO_PICKZONE


class Cell:
    def __init__(
        self,
        ports: CellPorts,
        publish_state: Callable[[CellState], None],
        publish_fault: Callable[[str, str], None],
        logger: Any,
    ) -> None:
        self.ports = ports
        self.model = CellModel()
        self._publish_state = publish_state
        self._publish_fault = publish_fault
        self._log = logger
        self._belt_mode: int | None = None  # the belt run in flight
        self._sorting: threading.Thread | None = None  # the SortCycle in flight
        self.exchanging: set[str] = set()
        self._awaiting_pallet: str | None = None  # the SortCycle's PalletExchange
        self.held: Pick | None = None  # in the DexterousPalm after a cut-short cycle (D32)
        self._placing = False  # the cycle in flight is the reset's place of `held`
        self._feed_waits_for_bin = False
        self._reset: FlushReset | None = None
        self._published_belt: tuple[float, list[BeltGear]] | None = None
        self._interlocks: dict[str, bool] = {}  # last seen; a bit that drops is a device fault
        self._belt_fault = 0
        self._feeder_state = ""
        self._closed = False
        self._loop = EventLoop(logger)
        self.post(self._publish)

    def post(self, handler: Callable[..., Any], *args: Any) -> None:
        self._loop.post(handler, *args)

    def ask(self, handler: Callable[[], tuple[bool, str]]) -> tuple[bool, str]:
        return self._loop.ask(handler)

    def halt(self) -> tuple[bool, str]:
        """No operation starts after this; the ones in flight end on their own."""
        self._closed = True
        return True, "Halted"

    def close(self) -> None:
        self.post(self.halt)
        self._loop.stop()
        if self._sorting is not None:
            self._sorting.join(timeout=5.0)

    def _publish(self) -> None:
        self._published_belt = (self.model.belt_offset_m, self.model.visible_gears())
        self._publish_state(self.model.snapshot())

    def _set_status(self, status: ConveyorStatus) -> None:
        self.model.status = status
        self._publish()

    # Operator intents (run through `ask`)
    def fill(self) -> tuple[bool, str]:
        if self.model.status not in _FILL_FROM:
            return False, f"Fill refused in {self.model.status.value}"
        if not self.ports.fill_feeder():
            return False, "FlexFeeder refused Fill"
        self._set_status(ConveyorStatus.LOADED)
        return True, "Fill started"

    def process(self) -> tuple[bool, str]:
        if self.model.status not in _PROCESS_FROM:
            return False, f"Process refused in {self.model.status.value}"
        if self.model.pending or self._sorting or self._awaiting_pallet:
            # Stopped mid-Batch: finish its SortCycles before the belt runs
            self._set_status(ConveyorStatus.HALTED)
            self._next_cycle()
        elif self._belt_mode is not None:  # the stopped run is still ending; its result decides
            self._set_status(ConveyorStatus.FEEDING)
        else:
            self._feed(first=self.model.status == ConveyorStatus.LOADED)
        return True, "Process started"

    def stop(self) -> tuple[bool, str]:
        if self.model.status not in _STOP_FROM:
            return False, f"Stop refused in {self.model.status.value}"
        # D30: the FlexFeeder stops placing; a running belt run still reaches the eye (its Batch is
        # registered, not sorted) or the final flush runs out; SortCycle and exchanges complete.
        self._feed_waits_for_bin = False
        self._set_status(ConveyorStatus.STOPPED)
        self.ports.enable_feeder(False)
        if self._belt_mode == _RUN:
            self.ports.finish_belt()
        return True, "Stop accepted"

    def emergency_stop(self) -> tuple[bool, str]:
        """The node already fired the FREEZE; this only moves the cell to FAULT."""
        self._reset = None
        self._feed_waits_for_bin = False
        self._set_status(ConveyorStatus.FAULT)
        return True, "EmergencyStop accepted"

    def reset(self) -> tuple[bool, str]:
        if self.model.status == ConveyorStatus.RESETTING:
            return False, "Reset refused in RESETTING"
        was_fault = self.model.status == ConveyorStatus.FAULT
        self.model.pending.clear()
        self._feed_waits_for_bin = False
        self._set_status(ConveyorStatus.RESETTING)
        self._reset = FlushReset(self, was_fault)
        self._reset.start()
        return True, "Reset started"

    # Status updates
    def on_belt_status(
        self, offset_m: float, gears: list[BeltGear], interlocks: dict[str, bool], belt_fault: int
    ) -> None:
        self.model.belt_offset_m, self.model.belt_gears = offset_m, gears
        self._belt_fault = belt_fault
        self._reject_new_defectives()
        # Edge-triggered: a latched fault raises once, and FAULT_ACK clears it before the next.
        lost = {k for k, ok in interlocks.items() if not ok and self._interlocks.get(k, True)}
        self._interlocks = interlocks
        if "drives_ok" in lost:
            self.fault("conveyor", f"DRIVE_FAULT_{belt_fault}")
        if "estop_chain_ok" in lost:
            self.fault("safety", "ESTOP_CHAIN_OPEN")

    def _reject_new_defectives(self) -> None:
        """D35: a defective rides past the PickZone eye, so it is Rejected as soon as belt
        tracking reports it, and the exit eye always finds it Rejected when it falls."""
        if self._closed or self.model.status in (ConveyorStatus.RESETTING, ConveyorStatus.FAULT):
            return
        for gear in self.model.belt_gears:
            if gear.intact or gear.id in self.model.registered:
                continue
            if not self.ports.register(gear.id, gear.x, gear.y, gear.color.value, False):
                self.fault("workcell", "REGISTER_REFUSED")
                return
            self.model.registered.add(gear.id)

    def on_feeder_status(self, remaining: int, state: str, fault: int) -> None:
        if state == "FAULT" and self._feeder_state != "FAULT":
            self.fault("feeder", f"FEEDER_FAULT_{fault}")
        self._feeder_state = state
        if remaining != self.model.feeder_remaining:
            self.model.feeder_remaining = remaining
            self._publish()

    def on_offset_tick(self) -> None:
        if (self.model.belt_offset_m, self.model.visible_gears()) != self._published_belt:
            self._publish()

    # Belt
    def start_belt(self, mode: int) -> None:
        if self._closed:
            return
        if mode == _RUN:
            self.ports.enable_feeder(True)
        self._belt_mode = mode
        self.ports.run_belt(mode, lambda result: self.post(self._on_belt_done, mode, result))

    def _feed(self, first: bool = False) -> None:
        """Next belt run: a feed run while Gearwheels are left (always for a new deck), else the
        final flush."""
        self._set_status(ConveyorStatus.FEEDING)
        if BIN in self.exchanging:  # the controller refuses belt runs while the bin is away
            self._feed_waits_for_bin = True
            return
        self.start_belt(_RUN if first or self.model.more_to_feed() else ConveyorRun.Goal.FLUSH)

    def _on_belt_done(self, mode: int, result: ConveyorRun.Result | None) -> None:
        self._belt_mode = None
        # The exit eye counted them: they did fall off the belt, whatever happened to the run.
        if result is not None and result.exit_count_delta:
            scrapped = self.ports.scrap(int(result.exit_count_delta))
            if scrapped is None:
                self.fault("workcell", "SCRAP_REFUSED")
                return
            self.model.counts[BIN] += scrapped
            self._publish()
        if self._reset is not None:
            self._reset.on_belt_done(result)
            return
        status = self.model.status
        if status == ConveyorStatus.FAULT:
            return
        reason = result.stop_reason if result is not None else "REJECTED"
        ok = result is not None and result.success
        if ok and mode == _RUN and reason == "STOPPED_AT_EYE":
            self._settle_belt(result.encoder_mm / 1000.0)
            self._at_eye_stop()
        elif ok and reason == "FLUSH_DONE":
            self.model.forget_belt()
            self._set_status(ConveyorStatus.EMPTY)
        else:
            code = (
                f"DRIVE_FAULT_{self._belt_fault}"
                if reason == "FAULT" and self._belt_fault
                else reason
            )
            self.fault("conveyor", code or "RUN_FAILED")

    def _settle_belt(self, offset_m: float) -> None:
        """The last belt status may predate the stop: move its Gearwheels to where the run ended.

        Status and result travel on different channels, so either may arrive first; the encoder
        in the result is the truth, and the belt carries every Gearwheel rigidly (+Y -> -Y).
        """
        shift = offset_m - self.model.belt_offset_m
        if shift:
            self.model.belt_gears = [
                g.model_copy(update={"y": g.y - shift}) for g in self.model.belt_gears
            ]
            self.model.belt_offset_m = offset_m

    def _at_eye_stop(self) -> None:
        """Register the Batch lead first, start the BinExchange if due, then sort."""
        picks: list[Pick] = []
        for gear in self.model.batch_at_eye():
            if not self.ports.register(gear.id, gear.x, gear.y, gear.color.value, gear.intact):
                self.fault("workcell", "REGISTER_REFUSED")
                return
            self.model.registered.add(gear.id)
            if gear.intact:
                picks.append(Pick(gear.id, gear.x, gear.y, gear.color.value))
        self.model.pending = picks
        if self.model.counts[BIN] >= BIN_EXCHANGE_THRESHOLD and BIN not in self.exchanging:
            self.start_exchange(BIN)  # overlaps the sorting
        if self.model.status == ConveyorStatus.FEEDING:
            self._set_status(ConveyorStatus.HALTED)
            self._next_cycle()

    # SortCycles
    def belt_running(self) -> bool:
        return self._belt_mode is not None

    def reset_owner(self) -> FlushReset | None:
        return self._reset

    def busy(self) -> bool:
        return self._sorting is not None or bool(self.exchanging) or self._belt_mode is not None

    def _next_cycle(self) -> None:
        if self._closed or self._sorting is not None or self._awaiting_pallet is not None:
            return
        if not self.model.pending:
            self._feed()  # Batch sorted, arm HOME
            return
        pick = self.model.pending[0]

        def work() -> None:
            self.post(self._on_cycle_done, pick, run_sort_cycle(self.ports, pick))

        self._sorting = threading.Thread(target=work, daemon=True)
        self._sorting.start()

    def place_held(self) -> None:
        """Flush reset: finish the held Gearwheel onto its colour's Pallet, then HOME."""
        pick = self.held
        if pick is None or self._closed or self._sorting is not None:
            return

        def work() -> None:
            self.post(self._on_cycle_done, pick, run_place(self.ports, pick))

        self._placing = True
        self._sorting = threading.Thread(target=work, daemon=True)
        self._sorting.start()

    def _on_cycle_done(self, pick: Pick, outcome: CycleOutcome) -> None:
        self._sorting = None
        placing, self._placing = self._placing, False
        self.held = pick if outcome.held else None
        if not outcome.ok:
            self.model.pending.clear()
            if placing:
                self.fault("arm", "PLACE_FAILED")
            elif self._reset is not None:  # the cycle the EmergencyStop cut short
                self._reset.advance()
            else:
                self.fault("arm", "SORT_CYCLE_FAILED")
            return
        if pick in self.model.pending:
            self.model.pending.remove(pick)
        self.model.picked.add(pick.id)
        self.model.counts[pick.color] = outcome.pallet_count
        self._publish()
        if self._reset is not None:  # the reset exchanges every non-empty Pallet itself
            self._reset.advance()
            return
        if outcome.full and self.model.status != ConveyorStatus.FAULT:
            self._awaiting_pallet = pick.color  # part of this SortCycle, even after Stop
            self.start_exchange(pick.color)
        if self.model.status == ConveyorStatus.HALTED:
            self._next_cycle()

    # Station exchanges
    def start_exchange(self, name: str) -> None:
        if self._closed:
            return
        self.exchanging.add(name)
        self.ports.exchange(
            name,
            on_state=lambda state: self.post(self._on_exchange_state, name, state),
            on_done=lambda ok, code: self.post(self._on_exchange_done, name, ok, code),
        )

    def _on_exchange_state(self, name: str, state: str) -> None:
        if name in self.exchanging and self.model.exchange_states[name] != state:
            self.model.exchange_states[name] = ExchangeState(state)
            self._publish()

    def _on_exchange_done(self, name: str, ok: bool, code: int) -> None:
        self.exchanging.discard(name)
        device = f"station_{name.lower()}"
        if not ok:
            self.model.exchange_states[name] = ExchangeState.FAULT
            self.fault(device, f"EXCHANGE_FAULT_{code}")
            return
        if not self.ports.reset_station(name):
            self.model.exchange_states[name] = ExchangeState.FAULT
            self.fault(device, "RESET_STATION_REFUSED")
            return
        self.model.counts[name] = 0
        self.model.exchange_states[name] = ExchangeState.HOME
        self._publish()
        if self._reset is not None:
            self._reset.advance()
            return
        if self._awaiting_pallet == name:
            self._awaiting_pallet = None
            if self.model.status == ConveyorStatus.HALTED:
                self._next_cycle()
        if name == BIN and self._feed_waits_for_bin:
            self._feed_waits_for_bin = False
            if self.model.status == ConveyorStatus.FEEDING:
                self._feed()

    # FAULT and the end of a reset
    def fault(self, device: str, code: str) -> None:
        """Device fault: freeze every device, cell FAULT, name the device for the ERROR frame."""
        if self.model.status == ConveyorStatus.FAULT:
            self._log.error(f"{device} fault {code} while already FAULT")
            return
        self._log.error(f"{device} fault {code}; cell FAULT")
        self._reset = None
        self._feed_waits_for_bin = False
        self.ports.freeze(
            lambda: self._log.error("Device freeze failed; hardware E-stop chain must act")
        )
        self._publish_fault(device, code)
        self._set_status(ConveyorStatus.FAULT)

    def finish_reset(self) -> None:
        self._reset = None
        self._awaiting_pallet = None
        self.model.forget_belt()
        self.model.counts = dict.fromkeys(self.model.counts, 0)
        self._set_status(ConveyorStatus.EMPTY)
