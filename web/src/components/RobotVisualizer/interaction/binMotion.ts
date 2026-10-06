import type { ExchangeState, StationStatus } from '@contracts';
import {
  BIN_LEAVE_MS,
  BIN_RETURN_MS,
  BIN_SLIDE_TRAVEL_M,
  BIN_TIP_ANGLE_RAD,
  BIN_TIP_MS,
  BIN_UNTIP_MS,
} from '@/components/RobotVisualizer/constants';
import { createStateClock, ease, exchangeTravel, leg } from './stationMotion';

export interface BinPose {
  /** 0 (HOME under the belt exit) .. 1 (end of the slide, +X off-scene). */
  slide: number;
  /** 0 (upright) .. 1 (tipped at the outer end). */
  tip: number;
}

/**
 * Bin pose for an exchange state `sinceMs` after it began: slide out, tip while AWAY, untip while
 * sliding back. Nominal durations, so a late device just holds the end of its leg.
 */
export function binPose(state: ExchangeState, sinceMs: number, held: BinPose): BinPose {
  const slide = exchangeTravel(state, sinceMs, BIN_LEAVE_MS, BIN_RETURN_MS, held.slide);
  switch (state) {
    case 'HOME':
    case 'LEAVING':
      return { slide, tip: 0 };
    case 'AWAY':
      return { slide, tip: ease(leg(sinceMs, BIN_TIP_MS)) };
    case 'RETURNING':
      return { slide, tip: 1 - ease(leg(sinceMs, BIN_UNTIP_MS)) };
    default:
      return held; // FAULT: stays where it stopped
  }
}

export interface BinMotion {
  /** Meters toward +X and radians of tip about the outer end, as of `nowMs`. */
  update: (
    stations: readonly StationStatus[] | undefined,
    nowMs: number,
  ) => { offsetM: number; tipRad: number };
}

export function createBinMotion(): BinMotion {
  const clock = createStateClock<BinPose>();

  return {
    update(stations, nowMs) {
      const station = stations?.find((s) => s.name === 'SCRAP');
      if (!station) {
        clock.clear();
        return { offsetM: 0, tipRad: 0 };
      }
      const { sinceMs, pose } = clock.tick(station.exchange_state, nowMs, { slide: 0, tip: 0 });
      const next = binPose(station.exchange_state, sinceMs, pose);
      clock.set(next);
      return { offsetM: next.slide * BIN_SLIDE_TRAVEL_M, tipRad: next.tip * BIN_TIP_ANGLE_RAD };
    },
  };
}
