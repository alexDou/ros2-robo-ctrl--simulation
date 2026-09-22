import * as THREE from 'three';
import { disposeMaterial } from '@/utils/three/dispose';

export interface PalmProceduralAssets {
  group: THREE.Group;
  nozzleMesh: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial>;
  dispose: () => void;
}

export function createDexterousPalm(): PalmProceduralAssets {
  const group = new THREE.Group();
  group.name = 'dexterous-palm';

  // 1. Aluminum mounting plate (cylinder: radius 0.045m, height 0.018m, bright polished metallic finish)
  const plateGeom = new THREE.CylinderGeometry(0.045, 0.045, 0.018, 32);
  plateGeom.rotateX(Math.PI / 2);
  const plateMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    metalness: 0.85,
    roughness: 0.15,
  });
  const plateMesh = new THREE.Mesh(plateGeom, plateMat);
  plateMesh.name = 'palm-baseplate';
  plateMesh.position.set(0, 0, 0.018 / 2);
  group.add(plateMesh);

  // 2. Pneumatic extension rod (cylinder: radius 0.014m, height 0.055m, brushed chrome steel finish)
  const rodGeom = new THREE.CylinderGeometry(0.014, 0.014, 0.055, 24);
  rodGeom.rotateX(Math.PI / 2);
  const rodMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    metalness: 0.7,
    roughness: 0.25,
  });
  const rodMesh = new THREE.Mesh(rodGeom, rodMat);
  rodMesh.name = 'palm-extension-rod';
  rodMesh.position.set(0, 0, 0.018 + 0.055 / 2);
  group.add(rodMesh);

  // 3. Industrial suction cup bellows nozzle (cylinder: radius 0.020m to 0.035m, height 0.035m, distinct industrial suction cup)
  const nozzleGeom = new THREE.CylinderGeometry(0.020, 0.035, 0.035, 32);
  nozzleGeom.rotateX(Math.PI / 2);
  const nozzleMat = new THREE.MeshStandardMaterial({
    color: 0x3b82f6,
    roughness: 0.5,
    metalness: 0.2,
    emissive: new THREE.Color(0x000000),
    emissiveIntensity: 0.0,
  });
  const nozzleMesh = new THREE.Mesh(nozzleGeom, nozzleMat);
  nozzleMesh.name = 'palm-suction-nozzle';
  nozzleMesh.position.set(0, 0, 0.018 + 0.055 + 0.035 / 2);
  group.add(nozzleMesh);

  const dispose = () => {
    plateGeom.dispose();
    disposeMaterial(plateMat);
    rodGeom.dispose();
    disposeMaterial(rodMat);
    nozzleGeom.dispose();
    disposeMaterial(nozzleMat);
  };

  return { group, nozzleMesh, dispose };
}
