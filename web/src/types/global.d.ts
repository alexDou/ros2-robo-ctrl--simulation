/// <reference types="vite/client" />
import type { GearColor } from '../../domain/contracts';
import type { BeltGearPosition } from '../components/RobotVisualizer/assets/beltgears';

export interface VisualizerRendererInfo {
  memory: {
    geometries: number;
    textures: number;
  };
  render: {
    calls: number;
    triangles: number;
    frame: number;
  };
}

export interface VisualizerNozzleState {
  isGrasped: boolean;
  emissiveHex: number;
  emissiveIntensity: number;
}

export interface RobotVisualizerGlobalHandle {
  isLoaded: () => boolean;
  isDisposed: () => boolean;
  getJointValue: (jointName: string) => number | null;
  getJointValues: () => Record<string, number>;
  getLinkWorldPosition: (linkName: string) => { x: number; y: number; z: number } | null;
  getLastRenderedPositions: () => number[];
  getRendererInfo: () => VisualizerRendererInfo | null;
  getScene: () => unknown;
  getRenderer: () => unknown;
  getRobot: () => unknown;
  getPalmNozzleState: () => VisualizerNozzleState | null;
  getPalletTrayMeshes: () => unknown[];
  getPalletTrayMeshByColor: (color: GearColor) => unknown;
  getScrapBinMesh: () => unknown;
  isScrapBinNonEmpty: () => boolean;
  getSnapshotGearCount: () => number;
  getSnapshotGearPosition: (
    id: string,
  ) => { x: number; y: number; z: number; bucket: string } | null;
  getSnapshotGearIds: () => string[];
  getSnapshotGearColor: (id: string) => GearColor | null;
  getSnapshotGearIntact: (id: string) => boolean | null;
  getSpawnedGearCount: () => number;
  getTowerGears: () => unknown[];
  getTowerGearCount: () => number;
  isGearAttached: () => boolean;
  wasGearEverAttached: () => boolean;
  getAttachedGearMesh: () => unknown;
  getPedestalMesh: () => unknown;
  getPalletLaneMesh: (color: 'WHITE' | 'GREEN' | 'BLUE') => unknown;
  getConveyorMesh: () => unknown;
  getHopperMesh: () => unknown;
  getBeltGearPositions: () => BeltGearPosition[];
  getBeltScroll: () => number;
  getHopperFillLevel: () => number;
  getGearMesh: () => unknown;
  getGearPosition: () => { x: number; y: number; z: number } | null;
  hasActiveGear: () => boolean;
  clearWorkspace: () => void;
}

declare global {
  interface Window {
    __teleop_ws?: WebSocket;
    __robot_visualizer?: RobotVisualizerGlobalHandle;
  }
}
