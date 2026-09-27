import { describe, it, expect } from 'vitest';
import { isReachable } from '@/components/RobotVisualizer/interaction/picking';
import { REACHABILITY_MAX_RADIUS } from '@/components/RobotVisualizer/constants';

describe('Unit 7 (hand-sim-ti22): far-X tower row inside reach ring', () => {
  it('accepts mat far corner (0.60, -0.22), R~0.639', () => {
    expect(isReachable(0.6, -0.22)).toBe(true);
  });

  it('accepts tower row XY (0.68, ±0.16 / 0.0), R<=0.70', () => {
    expect(isReachable(0.68, -0.16)).toBe(true);
    expect(isReachable(0.68, 0.0)).toBe(true);
    expect(isReachable(0.68, 0.16)).toBe(true);
  });

  it('max radius covers tower row reach (R~0.699)', () => {
    expect(REACHABILITY_MAX_RADIUS).toBeGreaterThanOrEqual(0.699);
  });
});
