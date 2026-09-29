import { describe, it, expect } from 'vitest';
import { createHopper, HOPPER_FILL_HEIGHT } from '@/components/RobotVisualizer/assets/hopper';
import { DECK_SIZE } from '@utils/conveyorController';

describe('Unit 8.2a: FeedHopper fill level (hand-sim-n5lx)', () => {
  it('sits at the belt upstream end and starts empty', () => {
    const hopper = createHopper();
    expect(hopper.group.name).toBe('feed-hopper');
    expect(hopper.group.position.y).toBeCloseTo(0.85, 2);
    expect(hopper.fillMesh.visible).toBe(false);
    expect(hopper.getFillLevel()).toBe(0);
  });

  it('fill height is proportional to the deck count', () => {
    const hopper = createHopper();
    hopper.setCount(DECK_SIZE);
    expect(hopper.getFillLevel()).toBe(1);
    expect(hopper.fillMesh.visible).toBe(true);
    expect(hopper.fillMesh.scale.z * HOPPER_FILL_HEIGHT).toBeCloseTo(HOPPER_FILL_HEIGHT, 6);

    hopper.setCount(DECK_SIZE / 2);
    expect(hopper.getFillLevel()).toBe(0.5);
    expect(hopper.fillMesh.scale.z).toBeCloseTo(0.5, 6);

    hopper.setCount(0);
    expect(hopper.fillMesh.visible).toBe(false);
  });

  it('clamps out-of-range counts', () => {
    const hopper = createHopper();
    hopper.setCount(500);
    expect(hopper.getFillLevel()).toBe(1);
    hopper.setCount(-3);
    expect(hopper.getFillLevel()).toBe(0);
  });
});
