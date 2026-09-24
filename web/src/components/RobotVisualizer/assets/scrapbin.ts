import * as THREE from 'three';
import { disposeMaterial } from '@/utils/three/dispose';
import { SCRAP_BIN_COORDS } from '@/components/RobotVisualizer/constants';

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

  // Open box/chute: floor + 4 low walls (0.12m x 0.10m footprint, 0.05m walls).
  const floorGeom = new THREE.BoxGeometry(0.12, 0.1, 0.006);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x7f1d1d, metalness: 0.4, roughness: 0.6 });
  const floorMesh = new THREE.Mesh(floorGeom, floorMat);
  floorMesh.name = 'scrap-bin-floor';
  floorMesh.position.set(0, 0, 0.003);
  group.add(floorMesh);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, metalness: 0.4, roughness: 0.55 });
  const wallGeoms: THREE.BoxGeometry[] = [];
  const mkWall = (w: number, d: number, x: number, y: number, i: number) => {
    const g = new THREE.BoxGeometry(w, d, 0.05);
    wallGeoms.push(g);
    const m = new THREE.Mesh(g, wallMat);
    m.name = `scrap-bin-wall-${i}`;
    m.position.set(x, y, 0.025);
    group.add(m);
  };
  mkWall(0.12, 0.006, 0, -0.047, 0);
  mkWall(0.12, 0.006, 0, 0.047, 1);
  mkWall(0.006, 0.1, -0.057, 0, 2);
  mkWall(0.006, 0.1, 0.057, 0, 3);

  // Fill marker: visible only when bin holds rejects (empty vs has-items).
  const fillGeom = new THREE.BoxGeometry(0.1, 0.08, 0.03);
  const fillMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.3, roughness: 0.6 });
  const fillMesh = new THREE.Mesh(fillGeom, fillMat);
  fillMesh.name = 'scrap-bin-fill';
  fillMesh.position.set(0, 0, 0.02);
  fillMesh.visible = false;
  group.add(fillMesh);

  let hasItems = false;
  const setHasItems = (next: boolean) => {
    hasItems = next;
    fillMesh.visible = next;
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
