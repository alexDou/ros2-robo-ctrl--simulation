import * as THREE from 'three';
import { disposeMaterial } from '@/utils/three/dispose';
import { BELT_X_RANGE } from '@/components/RobotVisualizer/constants';
import { DECK_SIZE } from '@utils/conveyorGating';

export interface HopperProceduralAssets {
  group: THREE.Group;
  fillMesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  /** Show `count` of DECK_SIZE gears in the reservoir. */
  setCount: (count: number) => void;
  /** Fill fraction in [0, 1]. */
  getFillLevel: () => number;
  dispose: () => void;
}

/** Hopper centre Y along the belt: upstream end, robot left. */
const HOPPER_Y = 0.85;
const HOPPER_SIZE_X = 0.3;
const HOPPER_SIZE_Y = 0.2;
const WALL = 0.01;
export const HOPPER_FILL_HEIGHT = 0.16;
const HOPPER_BASE_Z = 0.02;

/** FeedHopper: open-top reservoir above the belt's upstream end; the fill block scales with deck count. */
export function createHopper(): HopperProceduralAssets {
  const group = new THREE.Group();
  group.name = 'feed-hopper';
  group.position.set((BELT_X_RANGE[0] + BELT_X_RANGE[1]) / 2, HOPPER_Y, HOPPER_BASE_Z);

  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.5,
    metalness: 0.5,
    transparent: true,
    opacity: 0.55,
  });
  const wallGeoms: THREE.BoxGeometry[] = [];
  const addWall = (name: string, sx: number, sy: number, x: number, y: number) => {
    const geom = new THREE.BoxGeometry(sx, sy, HOPPER_FILL_HEIGHT);
    wallGeoms.push(geom);
    const wall = new THREE.Mesh(geom, wallMat);
    wall.name = name;
    wall.position.set(x, y, HOPPER_FILL_HEIGHT / 2);
    group.add(wall);
  };
  addWall('hopper-wall-left', WALL, HOPPER_SIZE_Y, -HOPPER_SIZE_X / 2, 0);
  addWall('hopper-wall-right', WALL, HOPPER_SIZE_Y, HOPPER_SIZE_X / 2, 0);
  addWall('hopper-wall-back', HOPPER_SIZE_X, WALL, 0, HOPPER_SIZE_Y / 2);
  addWall('hopper-wall-front', HOPPER_SIZE_X, WALL, 0, -HOPPER_SIZE_Y / 2);

  const fillGeom = new THREE.BoxGeometry(
    HOPPER_SIZE_X - 2 * WALL,
    HOPPER_SIZE_Y - 2 * WALL,
    HOPPER_FILL_HEIGHT,
  );
  // Unit-height box scaled in Z; translate so scaling grows upward from the floor.
  fillGeom.translate(0, 0, HOPPER_FILL_HEIGHT / 2);
  const fillMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.7,
    metalness: 0.3,
  });
  const fillMesh = new THREE.Mesh(fillGeom, fillMat);
  fillMesh.name = 'hopper-fill';
  fillMesh.visible = false;
  fillMesh.scale.z = 1e-3;
  group.add(fillMesh);

  let level = 0;
  return {
    group,
    fillMesh,
    setCount: (count) => {
      level = Math.min(1, Math.max(0, count / DECK_SIZE));
      fillMesh.visible = level > 0;
      fillMesh.scale.z = Math.max(level, 1e-3);
    },
    getFillLevel: () => level,
    dispose: () => {
      for (const g of wallGeoms) g.dispose();
      disposeMaterial(wallMat);
      fillGeom.dispose();
      disposeMaterial(fillMat);
    },
  };
}
