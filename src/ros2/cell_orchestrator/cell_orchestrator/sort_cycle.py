"""One SortCycle: PickAndPlace to the colour's PalletStation, committing the drop as it lands.

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


FAILED = CycleOutcome(ok=False)


def run_sort_cycle(ports: CellPorts, pick: Pick) -> CycleOutcome:
    drop = ports.drop_slot(pick.color)
    if drop is None:
        return FAILED
    grasping, releasing = threading.Event(), threading.Event()
    phases = {"GRASPING": grasping, "RELEASING": releasing}

    def on_phase(phase: str) -> None:
        event = phases.get(phase)
        if event is not None:
            event.set()

    result = ports.pick_and_place(pick, drop, on_phase)
    if result is None:
        return FAILED
    finished = threading.Event()
    result.add_done_callback(lambda _: finished.set())
    marked = False
    commit = None
    waited = 0.0
    while not finished.wait(_POLL_S):
        waited += _POLL_S
        if waited > _TIMEOUT_S:
            return FAILED
        if grasping.is_set() and not marked:
            marked = ports.mark_grasped()
        if marked and releasing.is_set() and commit is None:
            commit = ports.commit_drop()
    if not result.result().result.success:
        return FAILED
    if not marked:
        marked = ports.mark_grasped()
    if marked and commit is None:
        commit = ports.commit_drop()
    if not marked or commit is None:
        return FAILED
    return CycleOutcome(
        ok=True, pallet_count=int(commit.slot_index) + 1, full=bool(commit.overflow_occurred)
    )
