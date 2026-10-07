import * as THREE from 'three';
import { disposeMaterial } from '@/utils/three/dispose';
import { pocketCoords } from '@/utils/pallet';
import { PALLET_STATIONS } from '@/components/RobotVisualizer/constants';
import {
  PALLET_CAPACITY,
  PALLET_POCKET_COLS,
  PALLET_POCKET_DEPTH_M,
  PALLET_POCKET_PITCH_M,
  PALLET_POCKET_ROWS,
  PALLET_TRAY_HEIGHT_M,
  type GearColor,
} from '@contracts';

/** Tray edge beyond the outer pocket pitch. */
const TRAY_RIM_M = 0.01;
/** Tray material left between two neighbouring pockets. */
const POCKET_WEB_M = 0.002;

export const PALLET_TRAY_LENGTH_X = PALLET_POCKET_ROWS * PALLET_POCKET_PITCH_M + 2 * TRAY_RIM_M;
export const PALLET_TRAY_WIDTH_Y = PALLET_POCKET_COLS * PALLET_POCKET_PITCH_M + 2 * TRAY_RIM_M;

export interface PalletTrayAssets {
  group: THREE.Group;
  /** Solid tray body up to the pocket floors. */
  baseMesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  /** Top plate with the 2 x 5 pocket bores. */
  nestMesh: THREE.Mesh<THREE.ExtrudeGeometry, THREE.MeshStandardMaterial>;
  color: GearColor;
  dispose: () => void;
}

/**
 * A Pallet (D38): a nest tray with 2 x 5 round pockets, long axis along the PalletLane (X), on its
 * PalletStation. Group origin = station; Gearwheels rest on the pocket floors, half sunk.
 */
export function createPalletTray(color: GearColor = 'WHITE'): PalletTrayAssets {
  const station = PALLET_STATIONS[color];
  const group = new THREE.Group();
  group.name = 'pallet-tray';
  group.position.set(station.x, station.y, station.z);
  group.userData.color = color;

  const floorZ = PALLET_TRAY_HEIGHT_M - PALLET_POCKET_DEPTH_M;
  const material = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.75,
    metalness: 0.1,
  });

  const baseGeom = new THREE.BoxGeometry(PALLET_TRAY_LENGTH_X, PALLET_TRAY_WIDTH_Y, floorZ);
  const baseMesh = new THREE.Mesh(baseGeom, material);
  baseMesh.name = 'pallet-tray-base';
  baseMesh.position.set(0, 0, floorZ / 2);
  group.add(baseMesh);

  // Top plate: the tray outline with one bore per pocket, extruded up by the pocket depth.
  const shape = new THREE.Shape();
  shape.moveTo(-PALLET_TRAY_LENGTH_X / 2, -PALLET_TRAY_WIDTH_Y / 2);
  shape.lineTo(PALLET_TRAY_LENGTH_X / 2, -PALLET_TRAY_WIDTH_Y / 2);
  shape.lineTo(PALLET_TRAY_LENGTH_X / 2, PALLET_TRAY_WIDTH_Y / 2);
  shape.lineTo(-PALLET_TRAY_LENGTH_X / 2, PALLET_TRAY_WIDTH_Y / 2);
  shape.closePath();
  const boreRadius = PALLET_POCKET_PITCH_M / 2 - POCKET_WEB_M / 2;
  for (let k = 0; k < PALLET_CAPACITY; k++) {
    const [px, py] = pocketCoords([0, 0, 0], k);
    const bore = new THREE.Path();
    bore.absarc(px, py, boreRadius, 0, Math.PI * 2, true);
    shape.holes.push(bore);
  }
  const nestGeom = new THREE.ExtrudeGeometry(shape, {
    depth: PALLET_POCKET_DEPTH_M,
    bevelEnabled: false,
    curveSegments: 24,
  });
  const nestMesh = new THREE.Mesh(nestGeom, material);
  nestMesh.name = 'pallet-tray-nest';
  nestMesh.position.set(0, 0, floorZ);
  group.add(nestMesh);

  const dispose = () => {
    baseGeom.dispose();
    nestGeom.dispose();
    disposeMaterial(material);
  };

  return { group, baseMesh, nestMesh, color, dispose };
}
