import * as THREE from 'three';
import { disposeMaterial } from '@/utils/three/dispose';

export interface TableProceduralAssets {
  tableMesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  matMesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  borderLines: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>;
  reticleMesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  matBounds: { minX: number; maxX: number; minY: number; maxY: number };
  dispose: () => void;
}

export function createWorkcellTable(): TableProceduralAssets {
  const slabSizeX = 0.8;
  const slabSizeY = 0.6;
  const thickness = 0.04;
  const centerX = 0.55;
  const centerY = 0.0;

  const tableGeom = new THREE.BoxGeometry(slabSizeX, slabSizeY, thickness);
  const tableMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.8,
    metalness: 0.2,
  });
  const tableMesh = new THREE.Mesh(tableGeom, tableMat);
  tableMesh.name = 'workcell-table';
  tableMesh.position.set(centerX, centerY, -thickness / 2);

  // Sturdy industrial table legs
  const legWidth = 0.04;
  const legHeight = 0.215;
  const legGeom = new THREE.BoxGeometry(legWidth, legWidth, legHeight);
  const legMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.85,
    metalness: 0.25,
  });

  const legOffsetX = slabSizeX / 2 - 0.04;
  const legOffsetY = slabSizeY / 2 - 0.04;
  const legOffsets = [
    [-legOffsetX, -legOffsetY],
    [legOffsetX, -legOffsetY],
    [-legOffsetX, legOffsetY],
    [legOffsetX, legOffsetY],
  ];

  for (let i = 0; i < legOffsets.length; i++) {
    const [dx, dy] = legOffsets[i];
    const legMesh = new THREE.Mesh(legGeom, legMat);
    legMesh.name = `table-leg-${i}`;
    legMesh.position.set(dx, dy, -thickness / 2 - legHeight / 2);
    tableMesh.add(legMesh);
  }

  const bounds = {
    minX: centerX - slabSizeX / 2, // 0.15
    maxX: centerX + slabSizeX / 2, // 0.95
    minY: centerY - slabSizeY / 2, // -0.3
    maxY: centerY + slabSizeY / 2, // 0.3
  };

  // Dedicated landing mat across the reachable gear ingestion area (0.40m <= R <= 0.80m)
  const matBounds = {
    minX: 0.40,
    maxX: 0.70,
    minY: -0.22,
    maxY: 0.22,
  };
  const matSizeX = matBounds.maxX - matBounds.minX; // 0.30m
  const matSizeY = matBounds.maxY - matBounds.minY; // 0.44m
  const matThickness = 0.004;
  const matCenterX = (matBounds.minX + matBounds.maxX) / 2; // 0.55m
  const matCenterY = 0.0;

  const matGeom = new THREE.BoxGeometry(matSizeX, matSizeY, matThickness);
  const matMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a, // noticeably darker slate-900 precision surface
    roughness: 0.9,
    metalness: 0.1,
  });
  const matMesh = new THREE.Mesh(matGeom, matMat);
  matMesh.name = 'workcell-landing-mat';
  matMesh.position.set(matCenterX, matCenterY, matThickness / 2);

  // Technical boundary outline for landing mat
  const borderGeom = new THREE.EdgesGeometry(matGeom);
  const borderMat = new THREE.LineBasicMaterial({
    color: 0x38bdf8, // technical cyan border accent
    transparent: true,
    opacity: 0.85,
  });
  const borderLines = new THREE.LineSegments(borderGeom, borderMat);
  borderLines.name = 'workcell-landing-mat-border';
  borderLines.position.set(matCenterX, matCenterY, matThickness / 2);

  const reticleGeom = new THREE.RingGeometry(0.035, 0.045, 32);
  const reticleMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
    depthTest: false,
  });
  const reticleMesh = new THREE.Mesh(reticleGeom, reticleMat);
  reticleMesh.name = 'workcell-reticle';
  reticleMesh.visible = false;
  reticleMesh.renderOrder = 999;
  reticleMesh.position.set(centerX, centerY, 0.006);

  const dispose = () => {
    tableGeom.dispose();
    disposeMaterial(tableMat);
    legGeom.dispose();
    disposeMaterial(legMat);
    matGeom.dispose();
    disposeMaterial(matMat);
    borderGeom.dispose();
    disposeMaterial(borderMat);
    reticleGeom.dispose();
    disposeMaterial(reticleMat);
  };

  return { tableMesh, matMesh, borderLines, reticleMesh, bounds, matBounds, dispose };
}
