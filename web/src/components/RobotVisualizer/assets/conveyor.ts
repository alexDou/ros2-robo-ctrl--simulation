import * as THREE from 'three';
import { disposeMaterial } from '@/utils/three/dispose';
import { BELT_X_RANGE, BELT_Y_RANGE } from '@/components/RobotVisualizer/constants';

export interface ConveyorProceduralAssets {
  group: THREE.Group;
  /** Total belt travel in meters; the surface stripes move toward -Y and wrap. */
  setScroll: (travelM: number) => void;
  dispose: () => void;
}

const BELT_THICKNESS = 0.03;
const RAIL_WIDTH = 0.02;
const RAIL_HEIGHT = 0.03;
const LEG_WIDTH = 0.04;
const LEG_HEIGHT = 0.215;

/** Static conveyor: belt top at Z = 0, long axis along Y, footprint from the shared belt extent. */
export function createConveyor(): ConveyorProceduralAssets {
  const sizeX = BELT_X_RANGE[1] - BELT_X_RANGE[0];
  const sizeY = BELT_Y_RANGE[1] - BELT_Y_RANGE[0];

  const group = new THREE.Group();
  group.name = 'conveyor';
  group.position.set(
    (BELT_X_RANGE[0] + BELT_X_RANGE[1]) / 2,
    (BELT_Y_RANGE[0] + BELT_Y_RANGE[1]) / 2,
    0,
  );

  const beltGeom = new THREE.BoxGeometry(sizeX, sizeY, BELT_THICKNESS);
  const beltMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.9,
    metalness: 0.1,
  });
  const belt = new THREE.Mesh(beltGeom, beltMat);
  belt.name = 'conveyor-belt';
  belt.position.set(0, 0, -BELT_THICKNESS / 2);
  group.add(belt);

  const STRIPE_PITCH = 0.2;
  const stripeCount = Math.round(sizeY / STRIPE_PITCH);
  const stripePeriod = stripeCount * STRIPE_PITCH;
  const stripeGeom = new THREE.BoxGeometry(sizeX * 0.9, 0.012, 0.002);
  const stripeMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.9,
    metalness: 0.1,
  });
  const stripes: Array<{ mesh: THREE.Mesh; y0: number }> = [];
  for (let i = 0; i < stripeCount; i++) {
    const mesh = new THREE.Mesh(stripeGeom, stripeMat);
    mesh.name = `conveyor-stripe-${i}`;
    const y0 = -sizeY / 2 + (i + 0.5) * STRIPE_PITCH;
    mesh.position.set(0, y0, 0.001);
    group.add(mesh);
    stripes.push({ mesh, y0 });
  }
  const setScroll = (travelM: number) => {
    for (const { mesh, y0 } of stripes) {
      // Shift by travel, wrapped into [-period/2, period/2).
      const shifted = y0 - travelM;
      mesh.position.y =
        ((((shifted + stripePeriod / 2) % stripePeriod) + stripePeriod) % stripePeriod) -
        stripePeriod / 2;
    }
  };

  const railGeom = new THREE.BoxGeometry(RAIL_WIDTH, sizeY, RAIL_HEIGHT);
  const railMat = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    roughness: 0.6,
    metalness: 0.5,
  });
  for (const [i, side] of [-1, 1].entries()) {
    const rail = new THREE.Mesh(railGeom, railMat);
    rail.name = `conveyor-rail-${i}`;
    rail.position.set(side * (sizeX / 2 + RAIL_WIDTH / 2), 0, -RAIL_HEIGHT / 2);
    group.add(rail);
  }

  const legGeom = new THREE.BoxGeometry(LEG_WIDTH, LEG_WIDTH, LEG_HEIGHT);
  const legMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.85,
    metalness: 0.25,
  });
  const legOffsetX = sizeX / 2 - LEG_WIDTH;
  const legOffsetY = sizeY / 2 - LEG_WIDTH;
  for (const [i, [dx, dy]] of [
    [-legOffsetX, -legOffsetY],
    [legOffsetX, -legOffsetY],
    [-legOffsetX, legOffsetY],
    [legOffsetX, legOffsetY],
  ].entries()) {
    const leg = new THREE.Mesh(legGeom, legMat);
    leg.name = `conveyor-leg-${i}`;
    leg.position.set(dx, dy, -BELT_THICKNESS - LEG_HEIGHT / 2);
    group.add(leg);
  }

  const dispose = () => {
    beltGeom.dispose();
    disposeMaterial(beltMat);
    stripeGeom.dispose();
    disposeMaterial(stripeMat);
    railGeom.dispose();
    disposeMaterial(railMat);
    legGeom.dispose();
    disposeMaterial(legMat);
  };

  return { group, setScroll, dispose };
}
