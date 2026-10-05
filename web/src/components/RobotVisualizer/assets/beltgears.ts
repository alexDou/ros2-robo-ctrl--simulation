import * as THREE from 'three';
import {
  createProceduralGearwheel,
  setGearwheelColor,
  setGearwheelIntact,
  type GearwheelProceduralAssets,
} from '@/components/RobotVisualizer/assets/gear';
import type { BeltGear } from '@contracts';

/** A belt gear as rendered: its classification and mesh position (belt top is Z = 0). */
export type BeltGearPosition = BeltGear & { z: number };

export interface BeltGearsAssets {
  group: THREE.Group;
  /** Mirror the feeder's gears (by index); grows/shrinks the mesh pool as needed. */
  sync: (gears: readonly BeltGear[]) => void;
  getPositions: () => BeltGearPosition[];
  dispose: () => void;
}

/** Client-local gears riding the belt before they are registered in the workcell. */
export function createBeltGears(): BeltGearsAssets {
  const group = new THREE.Group();
  group.name = 'belt-gears';
  const pool: GearwheelProceduralAssets[] = [];
  let current: readonly BeltGear[] = [];

  return {
    group,
    sync: (gears) => {
      current = gears.map((g) => ({ ...g }));
      while (pool.length < gears.length) {
        const assets = createProceduralGearwheel();
        pool.push(assets);
        group.add(assets.group);
      }
      while (pool.length > gears.length) {
        const assets = pool.pop()!;
        group.remove(assets.group);
        assets.dispose();
      }
      gears.forEach((g, i) => {
        setGearwheelColor(pool[i], g.color);
        setGearwheelIntact(pool[i], g.intact);
        pool[i].group.position.set(g.x, g.y, 0);
      });
    },
    getPositions: () =>
      pool.map((a, i) => ({
        ...current[i],
        x: a.group.position.x,
        y: a.group.position.y,
        z: a.group.position.z,
      })),
    dispose: () => {
      for (const a of pool) {
        group.remove(a.group);
        a.dispose();
      }
      pool.length = 0;
    },
  };
}
