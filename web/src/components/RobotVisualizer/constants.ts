import {
  WHITE_TOWER,
  GREEN_TOWER,
  BLUE_TOWER,
  SCRAP_BIN,
  BELT_X_RANGE,
  BELT_Y_RANGE,
  PICK_ZONE_Y_RANGE,
  BELT_CAPACITY as DOMAIN_BELT_CAPACITY,
  TOWER_CAPACITY as DOMAIN_TOWER_CAPACITY,
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

export const TOWER_CAPACITY: number = DOMAIN_TOWER_CAPACITY;

/** Tower stack fade-out after auto-empty; the arm does not wait for it. */
export const TOWER_FADE_MS = 1500;

export const SCRAP_BIN_COORDS: SpindleTowerCoords = toCoords(SCRAP_BIN);

export const BELT_CAPACITY: number = DOMAIN_BELT_CAPACITY;
export { BELT_X_RANGE, BELT_Y_RANGE, PICK_ZONE_Y_RANGE };
