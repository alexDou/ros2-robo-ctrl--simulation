import { describe, it, expect } from 'vitest';
import { isReachable } from '@/components/RobotVisualizer/interaction/picking';
import { REACHABILITY_MAX_RADIUS } from '@/components/RobotVisualizer/constants';

describe('Unit 7 (hand-sim-ti22): BLUE-adjacent mat clicks inside reach ring', () => {
  it('accepts BLUE-adjacent mat corner (0.70, -0.22), R~0.734', () => {
    expect(isReachable(0.7, -0.22)).toBe(true);
  });

  it('accepts BLUE tower drop XY (0.70, -0.30), R~0.762', () => {
    expect(isReachable(0.7, -0.3)).toBe(true);
  });

  it('max radius covers BLUE tower reach (R~0.762)', () => {
    expect(REACHABILITY_MAX_RADIUS).toBeGreaterThanOrEqual(0.762);
  });
});
