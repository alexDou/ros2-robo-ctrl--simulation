import { describe, it, expect } from 'vitest';
import { extrapolateBeltOffset, MAX_EXTRAPOLATION_S } from '@utils/beltExtrapolation';
import { BELT_SPEED_MPS } from '@utils/beltFeeder';

const at = (conveyorStatus: string, beltOffsetM: number) => ({
  conveyorStatus: conveyorStatus as never,
  beltOffsetM,
  receivedAtMs: 1000,
});

describe('Unit 9.06: belt offset extrapolation (hand-sim-42d4)', () => {
  it('is 0 before any cell_state arrives', () => {
    expect(extrapolateBeltOffset(null, 5000)).toBe(0);
  });

  it('advances at belt speed from the last report while FEEDING', () => {
    expect(extrapolateBeltOffset(at('FEEDING', 1.0), 1500)).toBeCloseTo(1.0 + BELT_SPEED_MPS * 0.5);
  });

  it('holds the reported offset in every non-moving status', () => {
    for (const s of ['EMPTY', 'LOADED', 'HALTED', 'STOPPED', 'FAULT', 'RESETTING']) {
      expect(extrapolateBeltOffset(at(s, 2.0), 9000)).toBe(2.0);
    }
  });

  it('caps extrapolation so a lost update cannot run the belt away', () => {
    expect(extrapolateBeltOffset(at('FEEDING', 0), 1_000_000)).toBeCloseTo(
      BELT_SPEED_MPS * MAX_EXTRAPOLATION_S,
    );
  });
});
