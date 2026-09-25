import { WHITE_TOWER, GREEN_TOWER, BLUE_TOWER, SCRAP_BIN, TOWER_CAPACITY as DOMAIN_TOWER_CAPACITY } from '@contracts';
import type { GearColor } from '@contracts';

export const REACHABILITY_MIN_RADIUS = 0.40;
export const REACHABILITY_MAX_RADIUS = 0.8;
// Legacy single-tower alias (Unit 6.x): identical to SPINDLE_TOWERS.WHITE.
// Kept so existing single-tower scene/tests render unchanged.
export const SPINDLE_TOWER_COORDS = { x: 0.4, y: -0.3, z: 0.0 };
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

export const TOWER_CAPACITY: number = DOMAIN_TOWER_CAPACITY;

export const SCRAP_BIN_COORDS: SpindleTowerCoords = toCoords(SCRAP_BIN);
