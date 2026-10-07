"""Nest-tray Pallet geometry (D38): pocket k of a PalletStation, filled from the arm side."""

from collections.abc import Sequence

from domain import (
    PALLET_POCKET_COLS,
    PALLET_POCKET_DEPTH_M,
    PALLET_POCKET_PITCH_M,
    PALLET_POCKET_ROWS,
    PALLET_TRAY_HEIGHT_M,
)


def pocket_coords(station: Sequence[float], k: int) -> tuple[float, float, float]:
    """(x, y, z) where a Gearwheel is dropped into pocket k of the tray centred on `station`.

    Row 0 is the row nearest the arm (+X, the tray lies at -X of base_link), filled -Y first;
    z is the pocket floor, where the Gearwheel's base comes to rest."""
    if not 0 <= k < PALLET_POCKET_ROWS * PALLET_POCKET_COLS:
        raise ValueError(
            f"pocket {k} is outside the {PALLET_POCKET_ROWS}x{PALLET_POCKET_COLS} tray"
        )
    row, col = divmod(k, PALLET_POCKET_COLS)
    x = station[0] + ((PALLET_POCKET_ROWS - 1) / 2.0 - row) * PALLET_POCKET_PITCH_M
    y = station[1] + (col - (PALLET_POCKET_COLS - 1) / 2.0) * PALLET_POCKET_PITCH_M
    return x, y, station[2] + PALLET_TRAY_HEIGHT_M - PALLET_POCKET_DEPTH_M
