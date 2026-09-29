import { BELT_CAPACITY, BELT_X_RANGE, PICK_ZONE_Y_RANGE } from '@contracts';
import type { GearSpec } from '@utils/conveyorController';

/** Belt surface speed, +Y to -Y. */
export const BELT_SPEED_MPS = 0.4;
/** Minimum gear centre distance on the belt (gear diameter 0.10 m plus clearance). */
export const GEAR_MIN_SPACING_M = 0.13;
/** Gears drop onto the belt at the hopper's Y. */
export const HOPPER_EXIT_Y = 0.85;

const MIN_BATCH = 3;
/**
 * Two lanes whose X ranges are more than the min spacing apart, so consecutive gears never
 * conflict; same-lane gears are every other gear, and the Y gap below keeps those >= min spacing.
 * The Y gap range also bounds the batch length (<= 9 gaps) to fit inside the PickZone.
 */
const LANE_HALF_WIDTH = 0.02;
const LANE_A_X = BELT_X_RANGE[0] + 0.04;
const LANE_B_X = BELT_X_RANGE[1] - 0.04;
const GAP_MIN_M = GEAR_MIN_SPACING_M / 2 + 0.005;
const GAP_MAX_M = 0.1;

export interface BeltGear extends GearSpec {
  x: number;
  y: number;
}

export type FeederStatus = 'FEEDING' | 'HALTED';

export interface BeltFeeder {
  status: () => FeederStatus;
  /** Gears currently on the belt, in spawn order (lead gear first). */
  gears: () => readonly BeltGear[];
  /** Removes and returns the lead gear (it is being handed to the workcell); undefined when none. */
  take: () => BeltGear | undefined;
  /** Deck entries still in the hopper. */
  remaining: () => readonly GearSpec[];
  /** Total belt travel in meters, for the surface animation. */
  scroll: () => number;
  step: (dtSeconds: number) => void;
}

function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Feeds one Batch: gears leave the hopper one by one (random Y gap = random delay, random lateral X
 * within alternating lanes), and the belt halts exactly when the lead gear reaches the downstream
 * PickZone edge. Pure and clock-free: the caller drives `step`.
 */
export function createBeltFeeder(deck: readonly GearSpec[], seed: number): BeltFeeder {
  const rand = seededRandom(seed);
  const hopper = [...deck];
  const batchSize = Math.min(
    hopper.length,
    MIN_BATCH + Math.floor(rand() * (BELT_CAPACITY - MIN_BATCH + 1)),
  );
  const onBelt: BeltGear[] = [];
  let halted = batchSize === 0;
  let travelled = 0;
  let nextGap = 0; // spawn immediately

  const spawn = () => {
    const spec = hopper.shift()!;
    const laneX = onBelt.length % 2 === 0 ? LANE_A_X : LANE_B_X;
    const x = laneX + (rand() * 2 - 1) * LANE_HALF_WIDTH;
    onBelt.push({ color: spec.color, intact: spec.intact, x, y: HOPPER_EXIT_Y });
    nextGap = GAP_MIN_M + rand() * (GAP_MAX_M - GAP_MIN_M);
  };

  return {
    status: () => (halted ? 'HALTED' : 'FEEDING'),
    gears: () => onBelt,
    take: () => onBelt.shift(),
    remaining: () => hopper,
    scroll: () => travelled,
    step(dt) {
      if (halted || dt <= 0) return;
      let dist = BELT_SPEED_MPS * dt;
      // Stop rule: the lead gear may travel only up to the PickZone's downstream edge.
      if (onBelt.length > 0) {
        const toEdge = onBelt[0].y - PICK_ZONE_Y_RANGE[0];
        if (dist >= toEdge) {
          dist = Math.max(0, toEdge);
          halted = true;
        }
      }
      travelled += dist;
      for (const g of onBelt) g.y -= dist;
      if (onBelt.length > 0) nextGap -= dist;
      if (!halted && onBelt.length < batchSize && nextGap <= 0) spawn();
    },
  };
}
