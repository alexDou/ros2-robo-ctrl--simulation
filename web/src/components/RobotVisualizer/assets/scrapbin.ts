import * as THREE from 'three';
import { disposeMaterial } from '@/utils/three/dispose';
import { SCRAP_BIN_COORDS } from '@/components/RobotVisualizer/constants';

/** Footprint in meters: as wide as the belt (BELT_X_RANGE, 0.30 m) plus a margin each side. */
export const BIN_WIDTH_X = 0.34;
const BIN_DEPTH_Y = 0.1;
const WALL_T = 0.006;

/** Binary bin state colors: green while empty, red once it holds a defective gear. */
export const SCRAP_BIN_EMPTY_COLOR = 0x16a34a;
export const SCRAP_BIN_FILLED_COLOR = 0xdc2626;

export interface ScrapBinProceduralAssets {
  group: THREE.Group;
  fillMesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  hasItems: boolean;
  setHasItems: (hasItems: boolean) => void;
  dispose: () => void;
}

export function createScrapBin(): ScrapBinProceduralAssets {
  const group = new THREE.Group();
  group.name = 'scrap-bin';
  group.position.set(SCRAP_BIN_COORDS.x, SCRAP_BIN_COORDS.y, SCRAP_BIN_COORDS.z);

  // Open box/chute: floor + 4 low walls (BIN_WIDTH_X x BIN_DEPTH_Y footprint, 0.05m walls).
  // Floor and walls share the binary green/red state color.
  const floorGeom = new THREE.BoxGeometry(BIN_WIDTH_X, BIN_DEPTH_Y, 0.006);
  const floorMat = new THREE.MeshStandardMaterial({
    color: SCRAP_BIN_EMPTY_COLOR,
    metalness: 0.4,
    roughness: 0.6,
  });
  const floorMesh = new THREE.Mesh(floorGeom, floorMat);
  floorMesh.name = 'scrap-bin-floor';
  floorMesh.position.set(0, 0, 0.003);
  group.add(floorMesh);

  const wallMat = new THREE.MeshStandardMaterial({
    color: SCRAP_BIN_EMPTY_COLOR,
    metalness: 0.4,
    roughness: 0.55,
  });
  const wallGeoms: THREE.BoxGeometry[] = [];
  const mkWall = (w: number, d: number, x: number, y: number, i: number) => {
    const g = new THREE.BoxGeometry(w, d, 0.05);
    wallGeoms.push(g);
    const m = new THREE.Mesh(g, wallMat);
    m.name = `scrap-bin-wall-${i}`;
    m.position.set(x, y, 0.025);
    group.add(m);
  };
  const edgeY = (BIN_DEPTH_Y - WALL_T) / 2;
  const edgeX = (BIN_WIDTH_X - WALL_T) / 2;
  mkWall(BIN_WIDTH_X, WALL_T, 0, -edgeY, 0);
  mkWall(BIN_WIDTH_X, WALL_T, 0, edgeY, 1);
  mkWall(WALL_T, BIN_DEPTH_Y, -edgeX, 0, 2);
  mkWall(WALL_T, BIN_DEPTH_Y, edgeX, 0, 3);

  // Fill marker: visible only when bin holds rejects (empty vs has-items).
  const fillGeom = new THREE.BoxGeometry(BIN_WIDTH_X - 0.02, BIN_DEPTH_Y - 0.02, 0.03);
  const fillMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    metalness: 0.3,
    roughness: 0.6,
  });
  const fillMesh = new THREE.Mesh(fillGeom, fillMat);
  fillMesh.name = 'scrap-bin-fill';
  fillMesh.position.set(0, 0, 0.02);
  fillMesh.visible = false;
  group.add(fillMesh);

  let hasItems = false;
  const setHasItems = (next: boolean) => {
    hasItems = next;
    fillMesh.visible = next;
    const color = next ? SCRAP_BIN_FILLED_COLOR : SCRAP_BIN_EMPTY_COLOR;
    floorMat.color.setHex(color);
    wallMat.color.setHex(color);
  };

  const dispose = () => {
    floorGeom.dispose();
    disposeMaterial(floorMat);
    for (const g of wallGeoms) g.dispose();
    disposeMaterial(wallMat);
    fillGeom.dispose();
    disposeMaterial(fillMat);
  };

  return {
    group,
    fillMesh,
    get hasItems() {
      return hasItems;
    },
    setHasItems,
    dispose,
  };
}
