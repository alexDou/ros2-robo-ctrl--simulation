import type { ExchangeState, GearColor, StationStatus } from '@contracts';
import {
  PALLET_LANE_TRAVEL_M,
  PALLET_LEAVE_MS,
  PALLET_RETURN_MS,
} from '@/components/RobotVisualizer/constants';

const COLORS: readonly GearColor[] = ['WHITE', 'GREEN', 'BLUE'];

const ease = (t: number): number => t * t * (3 - 2 * t);

/**
 * Lane progress 0 (at the PalletStation) .. 1 (off-scene) for an exchange state `sinceMs` after it
 * began. The legs are animated with the nominal durations, so a late device just holds the end.
 */
export function palletProgress(state: ExchangeState, sinceMs: number, held = 0): number {
  const leg = (ms: number) => Math.min(1, Math.max(0, sinceMs / ms));
  switch (state) {
    case 'HOME':
      return 0;
    case 'LEAVING':
      return ease(leg(PALLET_LEAVE_MS));
    case 'AWAY':
      return 1;
    case 'RETURNING':
      return 1 - ease(leg(PALLET_RETURN_MS));
    default:
      return held; // FAULT: stays where it stopped
  }
}

export interface PalletMotion {
  /** Meters each Pallet is displaced toward -X along its lane, as of `nowMs`. */
  update: (
    stations: readonly StationStatus[] | undefined,
    nowMs: number,
  ) => Record<GearColor, number>;
  /** True while a Pallet is AWAY or RETURNING: its Gearwheels left with the next line. */
  isUnloaded: (color: GearColor) => boolean;
}

export function createPalletMotion(): PalletMotion {
  const seen = new Map<GearColor, { state: ExchangeState; sinceMs: number; progress: number }>();

  return {
    update(stations, nowMs) {
      const out: Record<GearColor, number> = { WHITE: 0, GREEN: 0, BLUE: 0 };
      for (const color of COLORS) {
        const station = stations?.find((s) => s.name === color);
        if (!station) {
          seen.delete(color);
          continue;
        }
        let rec = seen.get(color);
        if (!rec || rec.state !== station.exchange_state) {
          rec = { state: station.exchange_state, sinceMs: nowMs, progress: rec?.progress ?? 0 };
          seen.set(color, rec);
        }
        rec.progress = palletProgress(rec.state, nowMs - rec.sinceMs, rec.progress);
        out[color] = rec.progress * PALLET_LANE_TRAVEL_M;
      }
      return out;
    },
    isUnloaded(color) {
      const state = seen.get(color)?.state;
      return state === 'AWAY' || state === 'RETURNING';
    },
  };
}
