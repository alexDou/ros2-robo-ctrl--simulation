import type { CellStateSample, WorkcellSnapshot } from '@/hooks/useTelemetryStream';
import { BELT_SPEED_M_S, BELT_Y_RANGE, type BeltGear } from '@contracts';

/** Longest span extrapolated past the last report; a lost update must not run the belt away. */
export const MAX_EXTRAPOLATION_S = 1;

/** Seconds of belt motion since the last report; zero unless the belt is running. */
function movingSeconds(sample: CellStateSample, nowMs: number): number {
  if (sample.conveyorStatus !== 'FEEDING') return 0;
  return Math.min(Math.max(0, (nowMs - sample.receivedAtMs) / 1000), MAX_EXTRAPOLATION_S);
}

/**
 * Belt travel in meters for the surface animation. cell_state arrives at 5 Hz while the belt moves,
 * so between reports the offset advances at belt speed, and only while FEEDING.
 */
export function extrapolateBeltOffset(sample: CellStateSample | null, nowMs: number): number {
  if (!sample) return 0;
  return sample.beltOffsetM + BELT_SPEED_M_S * movingSeconds(sample, nowMs);
}

/** Tracked gears advanced along the belt (+Y to -Y) the same way, never past the belt end. */
export function extrapolateBeltGears(sample: CellStateSample | null, nowMs: number): BeltGear[] {
  if (!sample) return [];
  const travel = BELT_SPEED_M_S * movingSeconds(sample, nowMs);
  if (travel === 0) return sample.beltGears;
  return sample.beltGears.map((g) => ({ ...g, y: Math.max(BELT_Y_RANGE[0], g.y - travel) }));
}

/**
 * cell_state keeps a Gearwheel on the belt until its SortCycle ends; once the workcell has it on the
 * flange or a Pallet it is drawn there, so the belt copy goes.
 */
export function withoutLifted(
  gears: BeltGear[],
  workcell: Pick<WorkcellSnapshot, 'inProgress' | 'processed'> | undefined,
): BeltGear[] {
  if (!workcell) return gears;
  const lifted = new Set([...workcell.inProgress, ...workcell.processed].map((e) => e.id));
  return lifted.size ? gears.filter((g) => !lifted.has(g.id)) : gears;
}
