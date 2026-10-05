import { describe, it, expect } from 'vitest';
import {
  extrapolateBeltGears,
  extrapolateBeltOffset,
  MAX_EXTRAPOLATION_S,
} from '@utils/beltExtrapolation';
import { BELT_SPEED_M_S, BELT_Y_RANGE } from '@contracts';

const gear = { id: 'belt-1', x: 0.4, y: 0.5, color: 'GREEN' as const, intact: true };
const at = (conveyorStatus: string, beltOffsetM: number, beltGears = [gear]) => ({
  conveyorStatus: conveyorStatus as never,
  beltOffsetM,
  beltGears,
  receivedAtMs: 1000,
});

describe('Unit 9.06: belt offset extrapolation (hand-sim-42d4)', () => {
  it('is 0 before any cell_state arrives', () => {
    expect(extrapolateBeltOffset(null, 5000)).toBe(0);
  });

  it('advances at belt speed from the last report while FEEDING', () => {
    expect(extrapolateBeltOffset(at('FEEDING', 1.0), 1500)).toBeCloseTo(1.0 + BELT_SPEED_M_S * 0.5);
  });

  it('holds the reported offset in every non-moving status', () => {
    for (const s of ['EMPTY', 'LOADED', 'HALTED', 'STOPPED', 'FAULT', 'RESETTING']) {
      expect(extrapolateBeltOffset(at(s, 2.0), 9000)).toBe(2.0);
    }
  });

  it('caps extrapolation so a lost update cannot run the belt away', () => {
    expect(extrapolateBeltOffset(at('FEEDING', 0), 1_000_000)).toBeCloseTo(
      BELT_SPEED_M_S * MAX_EXTRAPOLATION_S,
    );
  });
});

describe('Unit 9.08: belt gear extrapolation (hand-sim-o9vg)', () => {
  it('is empty before any cell_state arrives', () => {
    expect(extrapolateBeltGears(null, 5000)).toEqual([]);
  });

  it('moves gears toward -Y at belt speed from the last report while FEEDING', () => {
    const [moved] = extrapolateBeltGears(at('FEEDING', 0), 1500);
    expect(moved.y).toBeCloseTo(0.5 - BELT_SPEED_M_S * 0.5);
    expect(moved).toMatchObject({ id: 'belt-1', x: 0.4, color: 'GREEN', intact: true });
  });

  it('holds reported positions when the belt is not moving', () => {
    expect(extrapolateBeltGears(at('HALTED', 0), 9000)).toEqual([gear]);
  });

  it('never carries a gear past the belt end and caps a lost update', () => {
    const near = at('FEEDING', 0, [{ ...gear, y: BELT_Y_RANGE[0] + 0.001 }]);
    expect(extrapolateBeltGears(near, 1_000_000)[0].y).toBe(BELT_Y_RANGE[0]);
    const [capped] = extrapolateBeltGears(at('FEEDING', 0), 1_000_000);
    expect(capped.y).toBeCloseTo(0.5 - BELT_SPEED_M_S * MAX_EXTRAPOLATION_S);
  });
});
