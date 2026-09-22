import * as THREE from 'three';
import { disposeMaterial } from '@/utils/three/dispose';

export interface GearwheelProceduralAssets {
  group: THREE.Group;
  dispose: () => void;
}

export function createProceduralGearwheel(): GearwheelProceduralAssets {
  const group = new THREE.Group();
  group.name = 'gearwheel';

  const radius = 0.04;
  const height = 0.02;

  const bodyGeom = new THREE.CylinderGeometry(radius * 0.9, radius * 0.9, height, 24);
  bodyGeom.rotateX(Math.PI / 2);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    metalness: 0.35,
    roughness: 0.5,
  });
  const bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
  bodyMesh.name = 'gear-body';
  bodyMesh.position.set(0, 0, height / 2);
  group.add(bodyMesh);

  const numTeeth = 12;
  const toothWidth = 0.008;
  const toothDepth = radius * 0.25;
  const toothGeom = new THREE.BoxGeometry(toothWidth, toothDepth, height);
  const toothMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    metalness: 0.4,
    roughness: 0.45,
  });

  for (let i = 0; i < numTeeth; i++) {
    const angle = (i * 2 * Math.PI) / numTeeth;
    const toothMesh = new THREE.Mesh(toothGeom, toothMat);
    toothMesh.name = `gear-tooth-${i}`;
    const dist = radius * 0.9;
    toothMesh.position.set(
      dist * Math.cos(angle),
      dist * Math.sin(angle),
      height / 2
    );
    toothMesh.rotation.z = angle + Math.PI / 2;
    group.add(toothMesh);
  }

  const hubGeom = new THREE.CylinderGeometry(radius * 0.25, radius * 0.25, height * 1.05, 16);
  hubGeom.rotateX(Math.PI / 2);
  const hubMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.5,
    roughness: 0.4,
  });
  const hubMesh = new THREE.Mesh(hubGeom, hubMat);
  hubMesh.name = 'gear-hub';
  hubMesh.position.set(0, 0, height / 2);
  group.add(hubMesh);

  const dispose = () => {
    bodyGeom.dispose();
    disposeMaterial(bodyMat);
    toothGeom.dispose();
    disposeMaterial(toothMat);
    hubGeom.dispose();
    disposeMaterial(hubMat);
  };

  return { group, dispose };
}
