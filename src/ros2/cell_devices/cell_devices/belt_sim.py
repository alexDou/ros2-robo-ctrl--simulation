"""Controller-local belt logic for virtual_plc: drive ramps, encoder, eye stop, exit counter.

Pure and clock-free: callers advance it with step(dt). Positions are mm along the belt from
its upstream end; the PickZone eye and the exit eye derive from the domain belt constants.
"""

from dataclasses import dataclass

from cell_devices.register_map import BeltCmd, BeltState
from domain import BELT_SPEED_M_S, BELT_Y_RANGE, PICK_ZONE_Y_RANGE

_ENCODER_MOD = 2**32
_COUNTER_MOD = 2**16


@dataclass(frozen=True)
class BeltParams:
    """Commissioning parameters; the operator never sets these."""

    speed_mm_s: float = BELT_SPEED_M_S * 1000.0
    accel_mm_s2: float = 300.0
    counts_per_mm: float = 10.0
    length_mm: float = (BELT_Y_RANGE[1] - BELT_Y_RANGE[0]) * 1000.0
    # Belt travels +Y -> -Y, so the downstream PickZone edge is the zone's low-Y bound.
    eye_mm: float = (BELT_Y_RANGE[1] - PICK_ZONE_Y_RANGE[0]) * 1000.0

    @property
    def braking_distance_mm(self) -> float:
        return self.speed_mm_s**2 / (2.0 * self.accel_mm_s2)


class BeltSim:
    def __init__(self, params: BeltParams | None = None) -> None:
        self.params = params or BeltParams()
        self.velocity_mm_s = 0.0
        self.travel_mm = 0.0
        self.exit_count = 0
        self.state = BeltState.IDLE
        self._moving_cmd = BeltCmd.NONE
        self._settle_state = BeltState.IDLE
        self._offsets_mm: list[float] = []

    @property
    def encoder_counts(self) -> int:
        return int(self.travel_mm * self.params.counts_per_mm) % _ENCODER_MOD

    @property
    def feeding(self) -> bool:
        """True while a run toward the PickZone eye is in progress (the feeder may place)."""
        return self._moving_cmd == BeltCmd.RUN_TO_PICKZONE

    @property
    def item_positions_mm(self) -> list[float]:
        return [self.travel_mm + offset for offset in self._offsets_mm]

    def add_item(self, at_mm: float) -> None:
        """An item (placed by the FlexFeeder) enters the belt at `at_mm` along it."""
        self._offsets_mm.append(at_mm - self.travel_mm)

    def command(self, cmd: BeltCmd, scrap_home: bool) -> None:
        if cmd in (BeltCmd.RUN_TO_PICKZONE, BeltCmd.FLUSH):
            if not scrap_home:
                self._moving_cmd = BeltCmd.NONE
                self._settle_state = BeltState.HELD_BIN_AWAY
                self.state = BeltState.HELD_BIN_AWAY
            elif cmd == BeltCmd.FLUSH and not self._offsets_mm:
                self._moving_cmd = BeltCmd.NONE
                self._settle(BeltState.FLUSH_DONE)
            else:
                self._moving_cmd = cmd
                self.state = BeltState.RUNNING
        elif cmd == BeltCmd.STOP:
            self._moving_cmd = BeltCmd.NONE
            self._settle(BeltState.IDLE)

    def halt(self) -> None:
        """FREEZE: the drive stops dead (no ramp); the run command is kept so RELEASE resumes it."""
        self.velocity_mm_s = 0.0

    def step(self, dt: float, scrap_home: bool) -> None:
        target = self.params.speed_mm_s if self._moving_cmd != BeltCmd.NONE else 0.0
        delta = self.params.accel_mm_s2 * dt
        if self.velocity_mm_s < target:
            self.velocity_mm_s = min(target, self.velocity_mm_s + delta)
        else:
            self.velocity_mm_s = max(target, self.velocity_mm_s - delta)

        before = self.item_positions_mm
        self.travel_mm += self.velocity_mm_s * dt
        self._advance_items(before)

        if self._moving_cmd == BeltCmd.FLUSH and not self._offsets_mm:
            self._moving_cmd = BeltCmd.NONE
            self._settle_state = BeltState.FLUSH_DONE
        if self._moving_cmd == BeltCmd.NONE and self.velocity_mm_s == 0.0:
            self.state = self._settle_state

    def _settle(self, final: BeltState) -> None:
        self._settle_state = final
        if self.velocity_mm_s == 0.0:
            self.state = final

    def _advance_items(self, before: list[float]) -> None:
        eye = self.params.eye_mm
        survivors: list[float] = []
        for offset, prev in zip(self._offsets_mm, before, strict=True):
            pos = self.travel_mm + offset
            if pos >= self.params.length_mm:
                self.exit_count = (self.exit_count + 1) % _COUNTER_MOD
                continue
            if self._moving_cmd == BeltCmd.RUN_TO_PICKZONE and prev < eye <= pos:
                self._moving_cmd = BeltCmd.NONE
                self._settle_state = BeltState.STOPPED_AT_EYE
            survivors.append(offset)
        self._offsets_mm = survivors
