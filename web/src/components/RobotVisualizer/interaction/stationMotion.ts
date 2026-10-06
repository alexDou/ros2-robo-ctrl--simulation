import type { ExchangeState } from '@contracts';

/** Smoothstep on 0..1. */
export const ease = (t: number): number => t * t * (3 - 2 * t);

/** Progress 0..1 of a leg `ms` long, `sinceMs` after it began. */
export const leg = (sinceMs: number, ms: number): number => Math.min(1, Math.max(0, sinceMs / ms));

/**
 * Station exchange travel 0 (HOME) .. 1 (AWAY) for an exchange state `sinceMs` after it began,
 * shared by PalletLanes and the ScrapBin slide. Legs use nominal durations, so a late device just
 * holds the end of its leg; FAULT holds `held`, where it stopped.
 */
export function exchangeTravel(
  state: ExchangeState,
  sinceMs: number,
  leaveMs: number,
  returnMs: number,
  held: number,
): number {
  switch (state) {
    case 'HOME':
      return 0;
    case 'LEAVING':
      return ease(leg(sinceMs, leaveMs));
    case 'AWAY':
      return 1;
    case 'RETURNING':
      return 1 - ease(leg(sinceMs, returnMs));
    default:
      return held;
  }
}

/** When each station entered its current exchange state, plus the pose it last had. */
export interface StateClock<P> {
  /** The record for `state` as of `nowMs`; a new state restarts the clock and keeps the pose. */
  tick: (state: ExchangeState, nowMs: number, initial: P) => { sinceMs: number; pose: P };
  set: (pose: P) => void;
  state: () => ExchangeState | null;
  clear: () => void;
}

export function createStateClock<P>(): StateClock<P> {
  let rec: { state: ExchangeState; startMs: number; pose: P } | null = null;
  return {
    tick(state, nowMs, initial) {
      if (!rec || rec.state !== state) rec = { state, startMs: nowMs, pose: rec?.pose ?? initial };
      return { sinceMs: nowMs - rec.startMs, pose: rec.pose };
    },
    set(pose) {
      if (rec) rec.pose = pose;
    },
    state: () => rec?.state ?? null,
    clear() {
      rec = null;
    },
  };
}
