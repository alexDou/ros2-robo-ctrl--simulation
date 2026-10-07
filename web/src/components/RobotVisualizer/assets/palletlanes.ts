import * as THREE from 'three';
import { disposeMaterial } from '@/utils/three/dispose';
import { PALLET_LANE_TRAVEL_M, PALLET_STATIONS } from '@/components/RobotVisualizer/constants';
import { PALLET_TRAY_LENGTH_X } from '@/components/RobotVisualizer/assets/pallettray';
import type { GearColor } from '@contracts';

const LANE_WIDTH_Y = 0.2; // under the 0.23 m nest tray, inside the PalletStation pitch
const LANE_THICKNESS = 0.02;
const ROLLER_RADIUS = 0.009;
const ROLLER_PITCH = 0.05;

export interface PalletLanesAssets {
  group: THREE.Group;
  lanes: Record<GearColor, THREE.Group>;
  dispose: () => void;
}

/** Roller lanes from each PalletStation along -X, off-scene; the Pallet rides them out and back. */
export function createPalletLanes(): PalletLanesAssets {
  const group = new THREE.Group();
  group.name = 'pallet-lanes';

  // From the tray's +X end at its station to its -X end once AWAY.
  const laneLength = PALLET_LANE_TRAVEL_M + PALLET_TRAY_LENGTH_X;
  const frameGeom = new THREE.BoxGeometry(laneLength, LANE_WIDTH_Y, LANE_THICKNESS);
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.7,
    metalness: 0.4,
  });
  const rollerGeom = new THREE.CylinderGeometry(
    ROLLER_RADIUS,
    ROLLER_RADIUS,
    LANE_WIDTH_Y * 0.9,
    16,
  );
  const rollerMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.3,
    metalness: 0.8,
  });

  const lanes = {} as Record<GearColor, THREE.Group>;
  for (const color of ['WHITE', 'GREEN', 'BLUE'] as const) {
    const station = PALLET_STATIONS[color];
    const lane = new THREE.Group();
    lane.name = `pallet-lane-${color.toLowerCase()}`;
    // Top surface flush with the station base (Z = 0); the lane runs from the station toward -X.
    lane.position.set(station.x - PALLET_LANE_TRAVEL_M / 2, station.y, -LANE_THICKNESS / 2);

    const frame = new THREE.Mesh(frameGeom, frameMat);
    frame.name = 'pallet-lane-frame';
    lane.add(frame);

    const count = Math.floor(laneLength / ROLLER_PITCH);
    for (let i = 0; i < count; i++) {
      const roller = new THREE.Mesh(rollerGeom, rollerMat);
      roller.name = 'pallet-lane-roller';
      roller.position.set(
        -laneLength / 2 + (i + 0.5) * ROLLER_PITCH,
        0,
        LANE_THICKNESS / 2 - ROLLER_RADIUS, // roller tops flush with the frame top, where the tray rests
      );
      lane.add(roller);
    }
    lanes[color] = lane;
    group.add(lane);
  }

  const dispose = () => {
    frameGeom.dispose();
    disposeMaterial(frameMat);
    rollerGeom.dispose();
    disposeMaterial(rollerMat);
  };

  return { group, lanes, dispose };
}
