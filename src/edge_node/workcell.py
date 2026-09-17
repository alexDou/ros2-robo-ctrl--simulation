"""In-process WorkcellState domain tracker for EdgeNode per ADR 0002 and ADR 0003."""

from dataclasses import dataclass
import math
import threading
from typing import Callable, Optional

from domain import PickAndPlaceTargetPayload, SpawnObjectPayload, SpawnObjectType
from edge_node.kinematics import DEFAULT_SPINDLE_TOWER_COORDS

GEAR_STACK_HEIGHT_STEP_M: float = 0.02
MAX_TOWER_STACK_CAPACITY: int = 10


class WorkcellOccupiedError(Exception):
    """Raised when attempting to spawn a workpiece while one is already active."""


@dataclass(frozen=True)
class ActiveGear:
    """Active gear workpiece placed in the workcell."""

    x: float
    y: float
    z: float
    object_type: SpawnObjectType = SpawnObjectType.GEAR


@dataclass(frozen=True)
class WorkpieceSpawnedEvent:
    """Domain event emitted when a workpiece pick-and-place target is registered."""

    pick_coords: tuple[float, float, float]
    drop_coords: tuple[float, float, float]
    command_id: Optional[str] = None
    object_type: SpawnObjectType = SpawnObjectType.GEAR

    def __post_init__(self) -> None:
        if len(self.pick_coords) != 3 or len(self.drop_coords) != 3:
            raise ValueError("Coordinates must be 3D (x, y, z) tuples")
        object.__setattr__(
            self,
            "pick_coords",
            (float(self.pick_coords[0]), float(self.pick_coords[1]), float(self.pick_coords[2])),
        )
        object.__setattr__(
            self,
            "drop_coords",
            (float(self.drop_coords[0]), float(self.drop_coords[1]), float(self.drop_coords[2])),
        )

    @property
    def pick(self) -> tuple[float, float, float]:
        """Alias returning (x, y, z) pick coordinates."""
        return self.pick_coords

    @property
    def drop(self) -> tuple[float, float, float]:
        """Alias returning (x, y, z) drop coordinates."""
        return self.drop_coords


class WorkcellState:
    """In-process workcell state tracker recording active workpiece presence, tower inventory, and event dispatch."""

    def __init__(self) -> None:
        self._active_gear: Optional[ActiveGear] = None
        self._placed_gears: int = 0
        self._listeners: list[Callable[[WorkpieceSpawnedEvent], None]] = []
        self._lock = threading.Lock()

    @property
    def has_active_gear(self) -> bool:
        """Returns True if an active gear is currently present in the workcell."""
        with self._lock:
            return self._active_gear is not None

    @property
    def active_gear(self) -> Optional[ActiveGear]:
        """Returns the active gear workpiece or None."""
        with self._lock:
            return self._active_gear

    @property
    def coordinates(self) -> Optional[tuple[float, float, float]]:
        """Returns (x, y, z) coordinates of the active gear, or None."""
        with self._lock:
            if self._active_gear is None:
                return None
            return (self._active_gear.x, self._active_gear.y, self._active_gear.z)

    @property
    def placed_gear_count(self) -> int:
        """Returns total number of gears placed on the SpindleTower."""
        with self._lock:
            return self._placed_gears

    @property
    def next_vacant_drop_height(self) -> float:
        """Calculates next vacant drop height z_k = (k % 10) * 0.02m per ADR 0003."""
        with self._lock:
            k = self._placed_gears % MAX_TOWER_STACK_CAPACITY
            return k * GEAR_STACK_HEIGHT_STEP_M

    @property
    def next_vacant_drop_coords(self) -> tuple[float, float, float]:
        """Returns default drop target coordinates for the next vacant SpindleTower slot."""
        with self._lock:
            k = self._placed_gears % MAX_TOWER_STACK_CAPACITY
            z_k = k * GEAR_STACK_HEIGHT_STEP_M
            return (
                DEFAULT_SPINDLE_TOWER_COORDS[0],
                DEFAULT_SPINDLE_TOWER_COORDS[1],
                z_k,
            )

    def calculate_drop_coords(
        self,
        custom_x: Optional[float] = None,
        custom_y: Optional[float] = None,
        custom_z: Optional[float] = None,
    ) -> tuple[float, float, float]:
        """Calculates effective drop coordinates taking into account custom overrides or tower stacking."""
        with self._lock:
            k = self._placed_gears % MAX_TOWER_STACK_CAPACITY
            z_k = k * GEAR_STACK_HEIGHT_STEP_M
            if custom_x is not None and custom_y is not None:
                z = custom_z if custom_z is not None else z_k
                return (float(custom_x), float(custom_y), float(z))
            return (
                DEFAULT_SPINDLE_TOWER_COORDS[0],
                DEFAULT_SPINDLE_TOWER_COORDS[1],
                z_k,
            )

    def record_placed_gear(self) -> int:
        """Records a gear placed onto the SpindleTower, clearing active gear and updating inventory."""
        with self._lock:
            self._placed_gears += 1
            self._active_gear = None
            return self._placed_gears

    def clear_active_gear(self) -> None:
        """Clears active workpiece without resetting SpindleTower inventory."""
        with self._lock:
            self._active_gear = None

    def subscribe(
        self, listener: Callable[[WorkpieceSpawnedEvent], None]
    ) -> Callable[[], None]:
        """Subscribes an event listener to WorkpieceSpawnedEvents. Returns an unsubscribe callback."""
        with self._lock:
            self._listeners.append(listener)

        def unsubscribe() -> None:
            self.unsubscribe(listener)

        return unsubscribe

    def unsubscribe(self, listener: Callable[[WorkpieceSpawnedEvent], None]) -> None:
        """Unsubscribes an event listener."""
        with self._lock:
            if listener in self._listeners:
                self._listeners.remove(listener)

    def emit(self, event: WorkpieceSpawnedEvent) -> None:
        """Emits a WorkpieceSpawnedEvent to all subscribed listeners."""
        with self._lock:
            listeners_copy = list(self._listeners)
        for listener in listeners_copy:
            listener(event)

    def publish_workpiece_spawned(self, event: WorkpieceSpawnedEvent) -> None:
        """Alias for emit."""
        self.emit(event)

    def spawn_pick_and_place(
        self,
        pick: tuple[float, float, float] | PickAndPlaceTargetPayload,
        drop: Optional[tuple[float, float, float]] = None,
        command_id: Optional[str] = None,
    ) -> WorkpieceSpawnedEvent:
        """Registers active workpiece and emits WorkpieceSpawnedEvent."""
        with self._lock:
            if isinstance(pick, PickAndPlaceTargetPayload):
                pick_coords = (pick.pick_x, pick.pick_y, pick.pick_z)
                k = self._placed_gears % MAX_TOWER_STACK_CAPACITY
                z_k = k * GEAR_STACK_HEIGHT_STEP_M
                if pick.drop_x is not None and pick.drop_y is not None:
                    drop_z = pick.drop_z if pick.drop_z is not None else z_k
                    drop_coords = (pick.drop_x, pick.drop_y, drop_z)
                else:
                    drop_coords = (
                        DEFAULT_SPINDLE_TOWER_COORDS[0],
                        DEFAULT_SPINDLE_TOWER_COORDS[1],
                        z_k,
                    )
            else:
                if len(pick) != 3:
                    raise ValueError(f"Pick coordinates must have length 3; received {pick}")
                pick_coords = (float(pick[0]), float(pick[1]), float(pick[2]))
                if drop is not None:
                    if len(drop) != 3:
                        raise ValueError(f"Drop coordinates must have length 3; received {drop}")
                    drop_coords = (float(drop[0]), float(drop[1]), float(drop[2]))
                else:
                    k = self._placed_gears % MAX_TOWER_STACK_CAPACITY
                    z_k = k * GEAR_STACK_HEIGHT_STEP_M
                    drop_coords = (
                        DEFAULT_SPINDLE_TOWER_COORDS[0],
                        DEFAULT_SPINDLE_TOWER_COORDS[1],
                        z_k,
                    )

            for c in (*pick_coords, *drop_coords):
                if not math.isfinite(c):
                    raise ValueError(
                        f"Coordinates must be finite numbers; received pick={pick_coords}, drop={drop_coords}"
                    )

            self._active_gear = ActiveGear(
                x=pick_coords[0],
                y=pick_coords[1],
                z=pick_coords[2],
            )

        event = WorkpieceSpawnedEvent(
            pick_coords=pick_coords,
            drop_coords=drop_coords,
            command_id=command_id,
        )
        self.emit(event)
        return event

    def spawn_gear(
        self,
        x_or_payload: float | SpawnObjectPayload,
        y: Optional[float] = None,
        z: Optional[float] = None,
        object_type: SpawnObjectType = SpawnObjectType.GEAR,
    ) -> ActiveGear:
        """Records active gear presence and coordinates.

        Raises:
            WorkcellOccupiedError: If an active gear is already present.
            ValueError: If coordinate arguments are incomplete or non-finite.
        """
        with self._lock:
            if self._active_gear is not None:
                raise WorkcellOccupiedError("Active gear is already present in workcell")

            if isinstance(x_or_payload, SpawnObjectPayload):
                x = x_or_payload.x
                y_val = x_or_payload.y
                z_val = x_or_payload.z
                obj_type = x_or_payload.object_type
            else:
                if y is None or z is None:
                    raise ValueError("y and z coordinates must be provided if x is a float")
                x = float(x_or_payload)
                y_val = float(y)
                z_val = float(z)
                obj_type = object_type

            if not (math.isfinite(x) and math.isfinite(y_val) and math.isfinite(z_val)):
                raise ValueError(
                    f"Coordinates must be finite numbers; received ({x}, {y_val}, {z_val})"
                )

            gear = ActiveGear(
                x=x,
                y=y_val,
                z=z_val,
                object_type=obj_type,
            )
            self._active_gear = gear
            return gear

    def clear(self) -> None:
        """Resets active gear presence, coordinates, and SpindleTower inventory."""
        with self._lock:
            self._active_gear = None
            self._placed_gears = 0
