import {
  PALLET_POCKET_COLS,
  PALLET_POCKET_DEPTH_M,
  PALLET_POCKET_PITCH_M,
  PALLET_POCKET_ROWS,
  PALLET_TRAY_HEIGHT_M,
} from '@contracts';

/**
 * Where a Gearwheel rests in pocket k of the nest tray centred on `station` (D38; mirrors
 * workcell_manager.pallet.pocket_coords). Row 0 is nearest the arm (+X), filled -Y first; z is the
 * pocket floor, the Gearwheel's base.
 */
export function pocketCoords(
  station: readonly [number, number, number] | readonly number[],
  k: number,
): [number, number, number] {
  if (!Number.isInteger(k) || k < 0 || k >= PALLET_POCKET_ROWS * PALLET_POCKET_COLS) {
    throw new RangeError(
      `pocket ${k} is outside the ${PALLET_POCKET_ROWS}x${PALLET_POCKET_COLS} tray`,
    );
  }
  const row = Math.floor(k / PALLET_POCKET_COLS);
  const col = k % PALLET_POCKET_COLS;
  return [
    station[0] + ((PALLET_POCKET_ROWS - 1) / 2 - row) * PALLET_POCKET_PITCH_M,
    station[1] + (col - (PALLET_POCKET_COLS - 1) / 2) * PALLET_POCKET_PITCH_M,
    station[2] + PALLET_TRAY_HEIGHT_M - PALLET_POCKET_DEPTH_M,
  ];
}
