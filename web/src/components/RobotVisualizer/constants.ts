import {
  WHITE_TOWER,
  GREEN_TOWER,
  BLUE_TOWER,
  SCRAP_BIN,
  DISPLAY_PANEL,
  BELT_X_RANGE,
  BELT_Y_RANGE,
  PICK_ZONE_Y_RANGE,
  BELT_CAPACITY as DOMAIN_BELT_CAPACITY,
  PALLET_CAPACITY as DOMAIN_PALLET_CAPACITY,
} from '@contracts';
import type { GearColor } from '@contracts';

// Legacy single-tower alias: identical to SPINDLE_TOWERS.WHITE.
// Kept so existing single-tower scene/tests render unchanged.
export const GRASP_RIDE_OFFSET_Z_M = 0.118;
export const JOINT_LERP_ALPHA = 0.25;
export const JOINT_SNAP_EPS = 1e-4;

export interface SpindleTowerCoords {
  x: number;
  y: number;
  z: number;
}

function toCoords(t: readonly [number, number, number]): SpindleTowerCoords {
  return { x: t[0], y: t[1], z: t[2] };
}

export const SPINDLE_TOWERS: Record<GearColor, SpindleTowerCoords> = {
  WHITE: toCoords(WHITE_TOWER),
  GREEN: toCoords(GREEN_TOWER),
  BLUE: toCoords(BLUE_TOWER),
};

export const SPINDLE_TOWER_COORDS: SpindleTowerCoords = SPINDLE_TOWERS.WHITE;

export const PALLET_CAPACITY: number = DOMAIN_PALLET_CAPACITY;

/** PalletLane length beyond the PalletStation along -X: a Pallet exchange ends off-scene. */
export const PALLET_LANE_TRAVEL_M = 1.0;
/** Nominal PalletExchange legs (virtual_plc PALLET_EXCHANGE, ~6 s): leave, dwell AWAY, return. */
export const PALLET_LEAVE_MS = 2000;
export const PALLET_AWAY_MS = 2000;
export const PALLET_RETURN_MS = 2000;

export const SCRAP_BIN_COORDS: SpindleTowerCoords = toCoords(SCRAP_BIN);

export const DISPLAY_PANEL_COORDS: SpindleTowerCoords = toCoords(DISPLAY_PANEL);

export const BELT_CAPACITY: number = DOMAIN_BELT_CAPACITY;
export { BELT_X_RANGE, BELT_Y_RANGE, PICK_ZONE_Y_RANGE };
