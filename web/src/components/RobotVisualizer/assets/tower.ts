import * as THREE from 'three';
import { disposeMaterial } from '@/utils/three/dispose';
import { SPINDLE_TOWERS } from '@/components/RobotVisualizer/constants';
import type { GearColor } from '@contracts';

export interface SpindleTowerProceduralAssets {
  group: THREE.Group;
  flangeMesh: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial>;
  pinMesh: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial>;
  color: GearColor;
  dispose: () => void;
}

export function createSpindleTower(color: GearColor = 'WHITE'): SpindleTowerProceduralAssets {
  const coords = SPINDLE_TOWERS[color];
  const group = new THREE.Group();
  group.name = 'spindle-tower';
  group.position.set(coords.x, coords.y, coords.z);
  group.userData.color = color;

  // 1. Aluminum base flange (r=0.04m, h=0.008m)
  const flangeRadius = 0.04;
  const flangeHeight = 0.008;
  const flangeGeom = new THREE.CylinderGeometry(flangeRadius, flangeRadius, flangeHeight, 32);
  flangeGeom.rotateX(Math.PI / 2);
  const flangeMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    metalness: 0.8,
    roughness: 0.2,
  });
  const flangeMesh = new THREE.Mesh(flangeGeom, flangeMat);
  flangeMesh.name = 'spindle-base-flange';
  flangeMesh.position.set(0, 0, flangeHeight / 2);
  group.add(flangeMesh);

  // 2. Vertical metal spindle pin / post (r=0.007m, h=0.20m)
  const pinRadius = 0.007;
  const pinHeight = 0.20;
  const pinGeom = new THREE.CylinderGeometry(pinRadius, pinRadius, pinHeight, 32);
  pinGeom.rotateX(Math.PI / 2);
  const pinMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    metalness: 0.85,
    roughness: 0.15,
  });
  const pinMesh = new THREE.Mesh(pinGeom, pinMat);
  pinMesh.name = 'spindle-pin';
  pinMesh.position.set(0, 0, pinHeight / 2);
  group.add(pinMesh);

  const dispose = () => {
    flangeGeom.dispose();
    disposeMaterial(flangeMat);
    pinGeom.dispose();
    disposeMaterial(pinMat);
  };

  return { group, flangeMesh, pinMesh, color, dispose };
}
