import * as THREE from 'three';
import { disposeMaterial } from '@/utils/three/dispose';

export interface PedestalProceduralAssets {
  group: THREE.Group;
  dispose: () => void;
}

export function createRobotPedestal(): PedestalProceduralAssets {
  const group = new THREE.Group();
  group.name = 'robot-pedestal-table';

  const thickness = 0.04;
  const tableWidth = 0.32;
  const tableDepth = 0.32;

  // 1. Pedestal top table slab (flush at Z = 0.0m)
  const topGeom = new THREE.BoxGeometry(tableWidth, tableDepth, thickness);
  const topMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.7,
    metalness: 0.3,
  });
  const topMesh = new THREE.Mesh(topGeom, topMat);
  topMesh.name = 'pedestal-top';
  topMesh.position.set(0, 0, -thickness / 2);
  group.add(topMesh);

  // 2. Machined aluminum mounting adapter flange under robot base
  const flangeRadius = 0.088;
  const flangeHeight = 0.005;
  const flangeGeom = new THREE.CylinderGeometry(flangeRadius, flangeRadius, flangeHeight, 32);
  flangeGeom.rotateX(Math.PI / 2);
  const flangeMat = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    metalness: 0.8,
    roughness: 0.2,
  });
  const flangeMesh = new THREE.Mesh(flangeGeom, flangeMat);
  flangeMesh.name = 'pedestal-flange';
  flangeMesh.position.set(0, 0, flangeHeight / 2);
  group.add(flangeMesh);

  // 3. Central heavy-duty support column
  const colRadius = 0.09;
  const colHeight = 0.20;
  const colGeom = new THREE.CylinderGeometry(colRadius, colRadius, colHeight, 32);
  colGeom.rotateX(Math.PI / 2);
  const colMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.85,
    metalness: 0.25,
  });
  const colMesh = new THREE.Mesh(colGeom, colMat);
  colMesh.name = 'pedestal-column';
  colMesh.position.set(0, 0, -thickness - colHeight / 2);
  group.add(colMesh);

  // 4. Floor mounting foot plate
  const footWidth = 0.36;
  const footDepth = 0.36;
  const footHeight = 0.015;
  const footGeom = new THREE.BoxGeometry(footWidth, footDepth, footHeight);
  const footMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.8,
    metalness: 0.3,
  });
  const footMesh = new THREE.Mesh(footGeom, footMat);
  footMesh.name = 'pedestal-foot';
  footMesh.position.set(0, 0, -thickness - colHeight - footHeight / 2);
  group.add(footMesh);

  const dispose = () => {
    topGeom.dispose();
    disposeMaterial(topMat);
    flangeGeom.dispose();
    disposeMaterial(flangeMat);
    colGeom.dispose();
    disposeMaterial(colMat);
    footGeom.dispose();
    disposeMaterial(footMat);
  };

  return { group, dispose };
}
