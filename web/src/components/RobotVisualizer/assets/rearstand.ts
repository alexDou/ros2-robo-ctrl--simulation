import * as THREE from 'three';
import { disposeMaterial } from '@/utils/three/dispose';
import { SPINDLE_TOWERS } from '@/components/RobotVisualizer/constants';

export interface RearStandProceduralAssets {
  group: THREE.Group;
  dispose: () => void;
}

const STAND_SIZE_X = 0.3;
const STAND_SIZE_Y = 0.5;
const SLAB_THICKNESS = 0.04;
const LEG_WIDTH = 0.04;
const LEG_HEIGHT = 0.215;

/** Rear stand carrying the SpindleTowers: top surface flush at Z = 0, centred on the tower row. */
export function createRearStand(): RearStandProceduralAssets {
  const towers = Object.values(SPINDLE_TOWERS);
  const centerX = towers.reduce((sum, t) => sum + t.x, 0) / towers.length;
  const centerY = towers.reduce((sum, t) => sum + t.y, 0) / towers.length;

  const group = new THREE.Group();
  group.name = 'rear-stand';
  group.position.set(centerX, centerY, 0);

  const slabGeom = new THREE.BoxGeometry(STAND_SIZE_X, STAND_SIZE_Y, SLAB_THICKNESS);
  const slabMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.8,
    metalness: 0.2,
  });
  const slab = new THREE.Mesh(slabGeom, slabMat);
  slab.name = 'rear-stand-top';
  slab.position.set(0, 0, -SLAB_THICKNESS / 2);
  group.add(slab);

  const legGeom = new THREE.BoxGeometry(LEG_WIDTH, LEG_WIDTH, LEG_HEIGHT);
  const legMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.85,
    metalness: 0.25,
  });
  const legOffsetX = STAND_SIZE_X / 2 - LEG_WIDTH;
  const legOffsetY = STAND_SIZE_Y / 2 - LEG_WIDTH;
  for (const [i, [dx, dy]] of [
    [-legOffsetX, -legOffsetY],
    [legOffsetX, -legOffsetY],
    [-legOffsetX, legOffsetY],
    [legOffsetX, legOffsetY],
  ].entries()) {
    const leg = new THREE.Mesh(legGeom, legMat);
    leg.name = `rear-stand-leg-${i}`;
    leg.position.set(dx, dy, -SLAB_THICKNESS - LEG_HEIGHT / 2);
    group.add(leg);
  }

  const dispose = () => {
    slabGeom.dispose();
    disposeMaterial(slabMat);
    legGeom.dispose();
    disposeMaterial(legMat);
  };

  return { group, dispose };
}
