import type { ExchangeState, GearColor, StationStatus } from '@contracts';
import {
  PALLET_LANE_TRAVEL_M,
  PALLET_LEAVE_MS,
  PALLET_RETURN_MS,
} from '@/components/RobotVisualizer/constants';
import { createStateClock, exchangeTravel, type StateClock } from './stationMotion';

const COLORS: readonly GearColor[] = ['WHITE', 'GREEN', 'BLUE'];

/** Lane progress 0 (at the PalletStation) .. 1 (off-scene) for an exchange state `sinceMs` after it began. */
export function palletProgress(state: ExchangeState, sinceMs: number, held = 0): number {
  return exchangeTravel(state, sinceMs, PALLET_LEAVE_MS, PALLET_RETURN_MS, held);
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
  const clocks = Object.fromEntries(COLORS.map((c) => [c, createStateClock<number>()])) as Record<
    GearColor,
    StateClock<number>
  >;

  return {
    update(stations, nowMs) {
      const out: Record<GearColor, number> = { WHITE: 0, GREEN: 0, BLUE: 0 };
      for (const color of COLORS) {
        const station = stations?.find((s) => s.name === color);
        if (!station) {
          clocks[color].clear();
          continue;
        }
        const { sinceMs, pose } = clocks[color].tick(station.exchange_state, nowMs, 0);
        const progress = palletProgress(station.exchange_state, sinceMs, pose);
        clocks[color].set(progress);
        out[color] = progress * PALLET_LANE_TRAVEL_M;
      }
      return out;
    },
    isUnloaded(color) {
      const state = clocks[color].state();
      return state === 'AWAY' || state === 'RETURNING';
    },
  };
}
