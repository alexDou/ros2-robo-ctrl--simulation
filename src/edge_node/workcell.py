"""In-process WorkcellState domain tracker for EdgeNode per ADR 0002."""

from dataclasses import dataclass
import math
import threading
from typing import Optional

from domain import SpawnObjectPayload, SpawnObjectType


class WorkcellOccupiedError(Exception):
    """Raised when attempting to spawn a workpiece while one is already active."""


@dataclass(frozen=True)
class ActiveGear:
    """Active gear workpiece placed in the workcell."""

    x: float
    y: float
    z: float
    object_type: SpawnObjectType = SpawnObjectType.GEAR


class WorkcellState:
    """In-process workcell state tracker recording active workpiece presence and coordinates."""

    def __init__(self) -> None:
        self._active_gear: Optional[ActiveGear] = None
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
        """Resets active gear presence and coordinates."""
        with self._lock:
            self._active_gear = None
