"""BeltTracker: where every Gearwheel lying on the belt is (no ROS dependency).

Pure bookkeeping: a placement record fixes a Gearwheel at the feeder at the encoder count of
its placement; from then on it moves with encoder travel. Positions are REP-103 meters.
"""

from dataclasses import dataclass

from cell_devices.flexfeeder import PlacementRecord
from domain import BELT_X_RANGE, BELT_Y_RANGE, PICK_ZONE_Y_RANGE

_SEQ_MOD = 2**16
_ID_PREFIX = "belt-"


@dataclass(frozen=True)
class TrackedGear:
    id: str
    x: float
    y: float
    color: str
    intact: bool


def batch(gears: list[TrackedGear]) -> list[TrackedGear]:
    """The Batch at an eye stop: Gearwheels inside the PickZone, lead (most downstream) first."""
    inside = [g for g in gears if PICK_ZONE_Y_RANGE[0] <= g.y <= PICK_ZONE_Y_RANGE[1]]
    return sorted(inside, key=lambda g: g.y)


def placement_seq(gear_id: str) -> int | None:
    """The 16-bit placement seq a tracked Gearwheel id was made from; None for any other id."""
    if not gear_id.startswith(_ID_PREFIX):
        return None
    try:
        return int(gear_id[len(_ID_PREFIX) :]) % _SEQ_MOD
    except ValueError:
        return None


class BeltTracker:
    def __init__(self, place_at_mm: float) -> None:
        self._place_at_mm = place_at_mm
        self._length_mm = (BELT_Y_RANGE[1] - BELT_Y_RANGE[0]) * 1000.0
        self._center_x_m = sum(BELT_X_RANGE) / 2.0
        self._gears: list[tuple[str, PlacementRecord]] = []
        self._last_seq = 0
        self._wraps = 0

    def add(self, record: PlacementRecord) -> None:
        if record.seq < self._last_seq:
            self._wraps += 1
        self._last_seq = record.seq
        self._gears.append((f"{_ID_PREFIX}{self._wraps * _SEQ_MOD + record.seq}", record))

    def gears(self, encoder_mm: float) -> list[TrackedGear]:
        """Gearwheels still on the belt at `encoder_mm`; those past the exit eye are forgotten."""
        self._gears = [
            (gear_id, rec)
            for gear_id, rec in self._gears
            if self._along_mm(rec, encoder_mm) < self._length_mm
        ]
        return [
            TrackedGear(
                id=gear_id,
                x=self._center_x_m + rec.lateral_x_mm / 1000.0,
                y=BELT_Y_RANGE[1] - self._along_mm(rec, encoder_mm) / 1000.0,
                color=rec.color,
                intact=rec.intact,
            )
            for gear_id, rec in self._gears
        ]

    def clear(self) -> None:
        self._gears.clear()

    def _along_mm(self, rec: PlacementRecord, encoder_mm: float) -> float:
        return self._place_at_mm + (encoder_mm - rec.encoder_mm)
