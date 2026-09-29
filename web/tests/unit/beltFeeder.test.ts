import { describe, it, expect } from 'vitest';
import { BELT_CAPACITY, BELT_X_RANGE, PICK_ZONE_Y_RANGE } from '@contracts';
import { buildDeck } from '@utils/conveyorController';
import {
  BELT_SPEED_MPS,
  GEAR_MIN_SPACING_M,
  HOPPER_EXIT_Y,
  createBeltFeeder,
} from '@utils/beltFeeder';

/** Fake clock: fixed 20 ms ticks until halted (or a safety cap). */
function runToHalt(seed: number, deckSize = 100) {
  const deck = buildDeck(seed).slice(0, deckSize);
  const feeder = createBeltFeeder(deck, seed);
  let t = 0;
  while (feeder.status() === 'FEEDING' && t < 60) {
    feeder.step(0.02);
    t += 0.02;
  }
  return { feeder, deck, elapsed: t };
}

describe('Unit 8.2b: belt feeds one Batch and halts (hand-sim-fe63)', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])(
    'seed %i: batch size in 3..BELT_CAPACITY, decremented from the deck, halts',
    (seed) => {
      const { feeder, deck } = runToHalt(seed);
      expect(feeder.status()).toBe('HALTED');
      const n = feeder.gears().length;
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(BELT_CAPACITY);
      expect(feeder.remaining()).toHaveLength(deck.length - n);
    },
  );

  it('batch sizes vary across seeds', () => {
    const sizes = new Set<number>();
    for (let s = 1; s <= 30; s++) sizes.add(runToHalt(s).feeder.gears().length);
    expect(sizes.size).toBeGreaterThan(3);
  });

  it('a short deck yields a smaller batch', () => {
    const { feeder } = runToHalt(3, 2);
    expect(feeder.gears()).toHaveLength(2);
    expect(feeder.remaining()).toHaveLength(0);
    expect(feeder.status()).toBe('HALTED');
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8])(
    'seed %i: lead gear is exactly at the PickZone edge and every gear is inside the PickZone',
    (seed) => {
      const { feeder } = runToHalt(seed);
      const ys = feeder.gears().map((g) => g.y);
      expect(Math.min(...ys)).toBeCloseTo(PICK_ZONE_Y_RANGE[0], 6);
      for (const g of feeder.gears()) {
        expect(g.y).toBeLessThanOrEqual(PICK_ZONE_Y_RANGE[1]);
        expect(g.y).toBeGreaterThanOrEqual(PICK_ZONE_Y_RANGE[0] - 1e-9);
        expect(g.x).toBeGreaterThanOrEqual(BELT_X_RANGE[0]);
        expect(g.x).toBeLessThanOrEqual(BELT_X_RANGE[1]);
      }
    },
  );

  it.each([1, 2, 3, 4, 5, 6, 7, 8])('seed %i: gear centres keep the minimum spacing', (seed) => {
    const gears = runToHalt(seed).feeder.gears();
    for (let i = 0; i < gears.length; i++) {
      for (let j = i + 1; j < gears.length; j++) {
        const d = Math.hypot(gears[i].x - gears[j].x, gears[i].y - gears[j].y);
        expect(d).toBeGreaterThanOrEqual(GEAR_MIN_SPACING_M - 1e-9);
      }
    }
  });

  it('gears appear one by one at the hopper exit and travel +Y to -Y', () => {
    const feeder = createBeltFeeder(buildDeck(5), 5);
    expect(feeder.status()).toBe('FEEDING');
    expect(feeder.gears()).toHaveLength(0);
    let prev = 0;
    let firstY: number | null = null;
    for (let i = 0; i < 400 && feeder.status() === 'FEEDING'; i++) {
      feeder.step(0.02);
      const n = feeder.gears().length;
      expect(n - prev).toBeLessThanOrEqual(1);
      prev = n;
      if (firstY === null && n === 1) {
        firstY = feeder.gears()[0].y;
        expect(firstY).toBeLessThanOrEqual(HOPPER_EXIT_Y);
        expect(firstY).toBeGreaterThan(HOPPER_EXIT_Y - BELT_SPEED_MPS * 0.05);
      }
    }
    expect(feeder.gears().length).toBeGreaterThanOrEqual(3);
  });

  it('is deterministic for a seed and frozen once halted', () => {
    const a = runToHalt(9).feeder.gears();
    const b = runToHalt(9).feeder.gears();
    expect(a).toEqual(b);
    const { feeder } = runToHalt(9);
    const frozen = feeder.gears().map((g) => ({ ...g }));
    feeder.step(1);
    expect(feeder.gears()).toEqual(frozen);
  });

  it('belt scroll advances while feeding and stops at halt', () => {
    const feeder = createBeltFeeder(buildDeck(4), 4);
    feeder.step(0.1);
    const s1 = feeder.scroll();
    expect(s1).toBeGreaterThan(0);
    while (feeder.status() === 'FEEDING') feeder.step(0.02);
    const s2 = feeder.scroll();
    feeder.step(1);
    expect(feeder.scroll()).toBe(s2);
  });
});
