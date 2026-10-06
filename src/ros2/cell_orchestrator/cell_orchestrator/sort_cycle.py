"""One SortCycle: PickAndPlace to the colour's PalletStation, committing the drop as it lands.
A cycle that ends after GRASPING but before its drop was committed leaves the Gearwheel held;
`run_place` later finishes it onto its Pallet (D32).

Runs on a worker thread (it blocks for the whole arm motion) and returns its outcome; the Cell
event loop decides what follows (next cycle, PalletExchange, FAULT).
"""

import threading
from dataclasses import dataclass

from cell_orchestrator.cell_model import Pick
from cell_orchestrator.ports import CellPorts

_POLL_S = 0.02
_TIMEOUT_S = 120.0


@dataclass(frozen=True)
class CycleOutcome:
    ok: bool
    pallet_count: int = 0  # Gearwheels on the colour's Pallet after this drop
    full: bool = False  # the 10th Gearwheel: the Pallet must be exchanged
    held: bool = False  # failed with the Gearwheel still in the DexterousPalm


FAILED = CycleOutcome(ok=False)
HELD = CycleOutcome(ok=False, held=True)


def run_sort_cycle(ports: CellPorts, pick: Pick) -> CycleOutcome:
    return _run(ports, pick, place_only=False)


def run_place(ports: CellPorts, pick: Pick) -> CycleOutcome:
    """The Gearwheel is already grasped (and marked): carry it to its Pallet, commit, HOME."""
    return _run(ports, pick, place_only=True)


def _run(ports: CellPorts, pick: Pick, place_only: bool) -> CycleOutcome:
    failed = HELD if place_only else FAILED
    drop = ports.drop_slot(pick.color)
    if drop is None:
        return failed
    grasping, releasing = threading.Event(), threading.Event()
    phases = {"GRASPING": grasping, "RELEASING": releasing}

    def on_phase(phase: str) -> None:
        event = phases.get(phase)
        if event is not None:
            event.set()

    marked = place_only  # a held Gearwheel was marked grasped by the cycle that picked it
    result = ports.pick_and_place(pick, drop, on_phase, place_only=place_only)
    if result is None:
        return failed
    finished = threading.Event()
    result.add_done_callback(lambda _: finished.set())
    commit = None
    waited = 0.0
    while not finished.wait(_POLL_S):
        waited += _POLL_S
        if waited > _TIMEOUT_S:
            return HELD if marked and commit is None else FAILED
        if grasping.is_set() and not marked:
            marked = ports.mark_grasped()
        if marked and releasing.is_set() and commit is None:
            commit = ports.commit_drop()
    if not result.result().result.success:
        return HELD if marked and commit is None else FAILED
    if not marked:
        marked = ports.mark_grasped()
    if marked and commit is None:
        commit = ports.commit_drop()
    if not marked or commit is None:
        return FAILED
    return CycleOutcome(
        ok=True, pallet_count=int(commit.slot_index) + 1, full=bool(commit.overflow_occurred)
    )
