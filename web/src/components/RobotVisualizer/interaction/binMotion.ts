import type { ExchangeState, StationStatus } from '@contracts';
import {
  BIN_LEAVE_MS,
  BIN_RETURN_MS,
  BIN_SLIDE_TRAVEL_M,
  BIN_TIP_ANGLE_RAD,
  BIN_TIP_MS,
  BIN_UNTIP_MS,
} from '@/components/RobotVisualizer/constants';

const ease = (t: number): number => t * t * (3 - 2 * t);
const leg = (sinceMs: number, ms: number): number => Math.min(1, Math.max(0, sinceMs / ms));

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
  switch (state) {
    case 'HOME':
      return { slide: 0, tip: 0 };
    case 'LEAVING':
      return { slide: ease(leg(sinceMs, BIN_LEAVE_MS)), tip: 0 };
    case 'AWAY':
      return { slide: 1, tip: ease(leg(sinceMs, BIN_TIP_MS)) };
    case 'RETURNING':
      return {
        slide: 1 - ease(leg(sinceMs, BIN_RETURN_MS)),
        tip: 1 - ease(leg(sinceMs, BIN_UNTIP_MS)),
      };
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
  let rec: { state: ExchangeState; sinceMs: number; pose: BinPose } | null = null;

  return {
    update(stations, nowMs) {
      const station = stations?.find((s) => s.name === 'SCRAP');
      if (!station) {
        rec = null;
        return { offsetM: 0, tipRad: 0 };
      }
      if (!rec || rec.state !== station.exchange_state) {
        rec = {
          state: station.exchange_state,
          sinceMs: nowMs,
          pose: rec?.pose ?? { slide: 0, tip: 0 },
        };
      }
      rec.pose = binPose(rec.state, nowMs - rec.sinceMs, rec.pose);
      return {
        offsetM: rec.pose.slide * BIN_SLIDE_TRAVEL_M,
        tipRad: rec.pose.tip * BIN_TIP_ANGLE_RAD,
      };
    },
  };
}
