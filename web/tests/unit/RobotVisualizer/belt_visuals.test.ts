import { describe, it, expect } from 'vitest';
import { createBeltGears } from '@/components/RobotVisualizer/assets/beltgears';
import { createConveyor } from '@/components/RobotVisualizer/assets/conveyor';
import { BELT_Y_RANGE } from '@contracts';

describe('Unit 8.2b: belt visuals (hand-sim-fe63)', () => {
  it('belt gear meshes mirror the feeder gears and are removed when the belt empties', () => {
    const belt = createBeltGears();
    belt.sync([
      { id: 'g1', color: 'GREEN', intact: true, x: 0.3, y: 0.5 },
      { id: 'g2', color: 'BLUE', intact: false, x: 0.5, y: 0.3 },
    ]);
    expect(belt.group.children).toHaveLength(2);
    expect(belt.getPositions()).toEqual([
      { id: 'g1', x: 0.3, y: 0.5, z: 0, color: 'GREEN', intact: true },
      { id: 'g2', x: 0.5, y: 0.3, z: 0, color: 'BLUE', intact: false },
    ]);
    belt.sync([{ id: 'g1', color: 'GREEN', intact: true, x: 0.3, y: 0.4 }]);
    expect(belt.group.children).toHaveLength(1);
    expect(belt.getPositions()[0].y).toBe(0.4);
    belt.sync([]);
    expect(belt.group.children).toHaveLength(0);
  });

  it('belt surface stripes move toward -Y with scroll, wrapping within the belt', () => {
    const conveyor = createConveyor();
    const stripe = conveyor.group.getObjectByName('conveyor-stripe-0')!;
    const y0 = stripe.position.y;
    conveyor.setScroll(0.05);
    expect(stripe.position.y).toBeCloseTo(y0 - 0.05, 6);
    conveyor.setScroll(10);
    const half = (BELT_Y_RANGE[1] - BELT_Y_RANGE[0]) / 2;
    expect(Math.abs(stripe.position.y)).toBeLessThanOrEqual(half);
    conveyor.setScroll(0);
    expect(stripe.position.y).toBeCloseTo(y0, 6);
  });
});
