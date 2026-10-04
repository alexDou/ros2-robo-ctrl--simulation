import type { CellStateSample } from '@/hooks/useTelemetryStream';
import { BELT_SPEED_MPS } from '@utils/beltFeeder';

/** Longest span extrapolated past the last report; a lost update must not run the belt away. */
export const MAX_EXTRAPOLATION_S = 1;

/**
 * Belt travel in meters for the surface animation. cell_state arrives at 5 Hz while the belt moves,
 * so between reports the offset advances at belt speed, and only while FEEDING.
 */
export function extrapolateBeltOffset(sample: CellStateSample | null, nowMs: number): number {
  if (!sample) return 0;
  if (sample.conveyorStatus !== 'FEEDING') return sample.beltOffsetM;
  const dt = Math.min(Math.max(0, (nowMs - sample.receivedAtMs) / 1000), MAX_EXTRAPOLATION_S);
  return sample.beltOffsetM + BELT_SPEED_MPS * dt;
}
