import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  createSnapshotStore,
  reconcileSnapshotGears,
} from '@/components/RobotVisualizer/interaction/snapshot';
import { TOWER_FADE_MS } from '@/components/RobotVisualizer/constants';
import type { GearEntry } from '@contracts';

const gear = (id: string, intact = true): GearEntry => ({
  id,
  x: -0.45,
  y: -0.26,
  z: 0,
  color: 'WHITE',
  intact,
  origin_x: 0.4,
  origin_y: 0,
  origin_z: 0,
});

const snap = (processed: GearEntry[]) => ({
  spawned: [],
  inProgress: [],
  processed,
  activeId: null,
});

function setup() {
  const store = createSnapshotStore();
  const robotGroup = new THREE.Group();
  const dirty = { n: 0 };
  const run = (processed: GearEntry[], now: number) =>
    reconcileSnapshotGears(store, snap(processed), {
      robotGroup,
      mountLink: null,
      onDirty: () => dirty.n++,
      now,
    });
  return { store, robotGroup, run, dirty };
}

describe('Unit 8.1b: tower fade-out on reset', () => {
  it('fades removed tower gears over ~1.5 s instead of popping them', () => {
    const { store, robotGroup, run } = setup();
    const stack = [gear('a'), gear('b')];
    run(stack, 0);
    expect(robotGroup.children).toHaveLength(2);

    run([], 100); // count reset to 0
    expect(robotGroup.children).toHaveLength(2);
    const mesh = store.gears.get('a')?.assets.group ?? store.fading.get('a')!.assets.group;
    const mat = (mesh.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    expect(mat.transparent).toBe(true);
    expect(mat.opacity).toBeCloseTo(1, 1);

    run([], 100 + TOWER_FADE_MS / 2);
    expect(mat.opacity).toBeGreaterThan(0.3);
    expect(mat.opacity).toBeLessThan(0.7);

    run([], 100 + TOWER_FADE_MS + 1);
    expect(robotGroup.children).toHaveLength(0);
    expect(store.fading.size).toBe(0);
  });

  it('removes defective gears immediately (bin recycle is not a tower fade)', () => {
    const { robotGroup, run } = setup();
    run([gear('d', false)], 0);
    run([], 10);
    expect(robotGroup.children).toHaveLength(0);
  });

  it('a new stack can start while the old one is fading', () => {
    const { robotGroup, run } = setup();
    run([gear('a')], 0);
    run([gear('n')], 50);
    expect(robotGroup.children).toHaveLength(2);
    run([gear('n')], 50 + TOWER_FADE_MS + 1);
    expect(robotGroup.children).toHaveLength(1);
  });
});
