import { describe, it, expect } from 'vitest';
import { towerCounts } from '@/utils/towerCounts';
import type { GearEntry } from '@contracts';

const e = (color: GearEntry['color'], intact: boolean): GearEntry => ({
  id: Math.random().toString(),
  x: 0,
  y: 0,
  z: 0,
  color,
  intact,
  origin_x: 0,
  origin_y: 0,
  origin_z: 0,
});

describe('towerCounts', () => {
  it('counts intact gears per color and ignores scrap', () => {
    expect(
      towerCounts([e('WHITE', true), e('WHITE', true), e('GREEN', true), e('BLUE', false)]),
    ).toEqual({ WHITE: 2, GREEN: 1, BLUE: 0 });
  });
  it('is zero for an empty snapshot', () => {
    expect(towerCounts([])).toEqual({ WHITE: 0, GREEN: 0, BLUE: 0 });
  });
});
