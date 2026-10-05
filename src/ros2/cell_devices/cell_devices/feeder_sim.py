"""Controller-local FlexFeeder logic for virtual_plc: seeded deck, spacing, placement cycle.

Pure and clock-free like BeltSim. The deck is generated at FILL behind the GearClassifier seam:
colour and intact are decided here, not by a vision stage (out of scope).
"""

import random
import time
from dataclasses import dataclass

from cell_devices.register_map import COLOR_CODES, FeederCmd, FeederState
from domain import BELT_Y_RANGE, PALLET_CAPACITY

DECK_DEFECTIVE = PALLET_CAPACITY
DECK_PER_COLOR = 3 * PALLET_CAPACITY
LATERAL_RANGE_MM = 30.0
# Feeder sits at the Unit 8 hopper spot, Y ~ +0.85.
FEEDER_Y_M = 0.85


@dataclass(frozen=True)
class FeederParams:
    """Commissioning parameters; the operator never sets these."""

    min_spacing_mm: float = 130.0
    # Variable cycle time is the source of Batch-size randomness.
    cycle_s_range: tuple[float, float] = (0.6, 2.5)
    emptying_s: float = 0.5
    counts_per_mm: float = 10.0
    place_at_mm: float = (BELT_Y_RANGE[1] - FEEDER_Y_M) * 1000.0


@dataclass(frozen=True)
class Placement:
    seq: int
    lateral_x_mm: int
    encoder_counts: int
    color: str
    intact: bool
    at_mm: float


def build_deck(rng: random.Random) -> list[tuple[str, bool]]:
    """Mocked GearClassifier output: colour and intact are decided here, once per Gearwheel."""
    deck = [(rng.choice(COLOR_CODES), False) for _ in range(DECK_DEFECTIVE)]
    deck += [(color, True) for color in COLOR_CODES for _ in range(DECK_PER_COLOR)]
    rng.shuffle(deck)
    return deck


class FeederSim:
    def __init__(self, params: FeederParams | None = None) -> None:
        self.params = params or FeederParams()
        self.state = FeederState.EMPTY
        self.enabled = False
        self.placement_count = 0
        self._deck: list[tuple[str, bool]] = []
        self._rng = random.Random()
        self._cycle_s = 0.0
        self._elapsed_s = 0.0
        self._last_place_travel_mm: float | None = None
        self._emptying_left_s = 0.0

    @property
    def remaining(self) -> int:
        return len(self._deck)

    def command(self, cmd: FeederCmd, seed: int) -> None:
        if cmd == FeederCmd.FILL and self.state == FeederState.EMPTY:
            self._rng = random.Random(seed or time.time_ns())
            self._deck = build_deck(self._rng)
            self.state = FeederState.READY
            self._draw_cycle()
        elif cmd == FeederCmd.ENABLE and self.remaining:
            self.enabled = True
        elif cmd == FeederCmd.DISABLE:
            self.enabled = False
            if self.state == FeederState.PLACING:
                self.state = FeederState.READY
        elif cmd == FeederCmd.QUICK_EMPTY:
            self._deck.clear()
            self.enabled = False
            self._emptying_left_s = self.params.emptying_s
            self.state = FeederState.EMPTYING

    def disable(self) -> None:
        self.command(FeederCmd.DISABLE, 0)

    def step(self, dt: float, feeding: bool, travel_mm: float) -> list[Placement]:
        """Advance by dt; `feeding` is true only while the belt runs toward the PickZone eye."""
        if self.state == FeederState.EMPTYING:
            self._emptying_left_s -= dt
            if self._emptying_left_s <= 0.0:
                self.state = FeederState.EMPTY
            return []
        if self.state not in (FeederState.READY, FeederState.PLACING):
            return []

        if not (self.enabled and feeding):
            if self.state == FeederState.PLACING:
                self.state = FeederState.READY
            return []

        self.state = FeederState.PLACING
        self._elapsed_s += dt
        if self._elapsed_s < self._cycle_s or not self._spaced(travel_mm):
            return []
        return [self._place(travel_mm)]

    def _spaced(self, travel_mm: float) -> bool:
        last = self._last_place_travel_mm
        return last is None or travel_mm - last >= self.params.min_spacing_mm

    def _place(self, travel_mm: float) -> Placement:
        color, intact = self._deck.pop()
        self.placement_count = (self.placement_count + 1) % 2**16
        self._last_place_travel_mm = travel_mm
        self._draw_cycle()
        if not self._deck:
            self.enabled = False
            self.state = FeederState.EMPTY
        return Placement(
            seq=self.placement_count,
            lateral_x_mm=round(self._rng.uniform(-LATERAL_RANGE_MM, LATERAL_RANGE_MM)),
            encoder_counts=int(travel_mm * self.params.counts_per_mm) % 2**32,
            color=color,
            intact=intact,
            at_mm=self.params.place_at_mm,
        )

    def _draw_cycle(self) -> None:
        self._cycle_s = self._rng.uniform(*self.params.cycle_s_range)
        self._elapsed_s = 0.0
