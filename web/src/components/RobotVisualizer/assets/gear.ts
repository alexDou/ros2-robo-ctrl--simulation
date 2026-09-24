import * as THREE from 'three';
import { disposeMaterial } from '@/utils/three/dispose';
import type { GearColor } from '@contracts';

export interface GearwheelProceduralAssets {
  group: THREE.Group;
  color: GearColor | null;
  intact: boolean | null;
  dispose: () => void;
}

// Classified body/tooth/hub hexes by gear color. Null (grey) = pre-echo default.
export const GEAR_GREY_HEX = { body: 0x64748b, tooth: 0x475569, hub: 0x1e293b };
export const GEAR_CLASSIFIED_HEX: Record<GearColor, { body: number; tooth: number; hub: number }> = {
  WHITE: { body: 0xf8fafc, tooth: 0xe2e8f0, hub: 0x94a3b8 },
  GREEN: { body: 0x22c55e, tooth: 0x15803d, hub: 0x14532d },
  BLUE: { body: 0x3b82f6, tooth: 0x1d4ed8, hub: 0x1e3a8a },
};

export function setGearwheelColor(assets: GearwheelProceduralAssets, color: GearColor | null | undefined): boolean {
  const next = color ?? null;
  if (assets.color === next) return false;
  assets.color = next;
  const hex = next ? GEAR_CLASSIFIED_HEX[next] : null;
  for (const child of assets.group.children) {
    const mesh = child as THREE.Mesh;
    const mat = mesh.material as THREE.MeshStandardMaterial | undefined;
    if (!mat || !('color' in mat)) continue;
    if (mesh.name === 'gear-body') mat.color.setHex(hex ? hex.body : GEAR_GREY_HEX.body);
    else if (mesh.name.startsWith('gear-tooth-')) mat.color.setHex(hex ? hex.tooth : GEAR_GREY_HEX.tooth);
    else if (mesh.name === 'gear-hub') mat.color.setHex(hex ? hex.hub : GEAR_GREY_HEX.hub);
  }
  return true;
}

export function setGearwheelIntact(assets: GearwheelProceduralAssets, intact: boolean | null | undefined): boolean {
  if (intact == null) return false;
  if (assets.intact === intact) return false;
  assets.intact = intact;
  const notch = assets.group.getObjectByName('gear-crack-notch');
  if (notch) notch.visible = intact === false;
  return true;
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

  // Crack notch: thin dark wedge across body rim, visible only when
  // intact === false. Separate mesh so recolor never touches it.
  const notchGeom = new THREE.BoxGeometry(0.006, radius * 0.55, height * 1.2);
  const notchMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    metalness: 0.1,
    roughness: 0.9,
  });
  const notchMesh = new THREE.Mesh(notchGeom, notchMat);
  notchMesh.name = 'gear-crack-notch';
  notchMesh.position.set(radius * 0.55, 0, height / 2);
  notchMesh.rotation.z = 0.35;
  notchMesh.visible = false;
  group.add(notchMesh);

  const dispose = () => {
    bodyGeom.dispose();
    disposeMaterial(bodyMat);
    toothGeom.dispose();
    disposeMaterial(toothMat);
    hubGeom.dispose();
    disposeMaterial(hubMat);
    notchGeom.dispose();
    disposeMaterial(notchMat);
  };

  return { group, color: null, intact: null, dispose };
}
