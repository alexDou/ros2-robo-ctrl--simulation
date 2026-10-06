"""The cell's state as the orchestrator knows it, and its cell_state snapshot.

Only the Cell event loop touches a CellModel, so it needs no lock. Station counts come from device
results (CommitDrop, ScrapRejected, ResetStation), never from an asynchronous snapshot, so a
decision taken on them can't be overtaken by a message still in flight.
"""

from dataclasses import dataclass, field

from domain import (
    PICK_ZONE_Y_RANGE,
    BeltGear,
    CellState,
    ConveyorStatus,
    ExchangeState,
    StationName,
    StationStatus,
)

BIN = StationName.SCRAP.value  # the ScrapBin: same exchange machine, not a PalletStation
PALLET_COLORS = tuple(name.value for name in StationName if name.value != BIN)
STATIONS = (*PALLET_COLORS, BIN)


@dataclass(frozen=True)
class Pick:
    """An intact Gearwheel registered at an eye stop, waiting for its SortCycle."""

    id: str
    x: float
    y: float
    color: str


@dataclass
class CellModel:
    status: ConveyorStatus = ConveyorStatus.EMPTY
    feeder_remaining: int = 0
    belt_offset_m: float = 0.0
    belt_gears: list[BeltGear] = field(default_factory=list)
    registered: set[str] = field(default_factory=set)
    picked: set[str] = field(default_factory=set)
    pending: list[Pick] = field(default_factory=list)  # the Batch's SortCycles, lead first
    counts: dict[str, int] = field(default_factory=lambda: dict.fromkeys(STATIONS, 0))
    exchange_states: dict[str, ExchangeState] = field(
        default_factory=lambda: dict.fromkeys(STATIONS, ExchangeState.HOME)
    )

    def visible_gears(self) -> list[BeltGear]:
        """Gearwheels the arm has taken off the belt no longer ride it."""
        return [g for g in self.belt_gears if g.id not in self.picked]

    def batch_at_eye(self) -> list[BeltGear]:
        """New Gearwheels from the PickZone's upstream edge down, lead (most downstream) first.

        No lower bound: the drive ramps down after the eye trips, so the lead stops a little
        past the zone's downstream edge and still belongs to this Batch.
        """
        hi = PICK_ZONE_Y_RANGE[1]
        return sorted(
            (g for g in self.belt_gears if g.y <= hi and g.id not in self.registered),
            key=lambda g: g.y,
        )

    def more_to_feed(self) -> bool:
        """Gearwheels left in the FlexFeeder or waiting upstream: feed run, else the final flush."""
        waiting = any(g.id not in self.registered for g in self.belt_gears)
        return self.feeder_remaining > 0 or waiting

    def forget_belt(self) -> None:
        self.registered.clear()
        self.picked.clear()
        self.pending.clear()

    def snapshot(self) -> CellState:
        return CellState(
            conveyor_status=self.status,
            feeder_remaining=self.feeder_remaining,
            belt_offset_m=self.belt_offset_m,
            belt_gears=self.visible_gears(),
            stations=[
                StationStatus(
                    name=StationName(name),
                    exchange_state=self.exchange_states[name],
                    count=self.counts[name],
                )
                for name in STATIONS
            ],
        )
