/// <reference types="vite/client" />
import type { GearColor } from '../../domain/contracts';

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

export interface VisualizerRaycastResult {
  x: number;
  y: number;
  z: number;
  isReachable: boolean;
  isInsideTable: boolean;
  isInsideMat: boolean;
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
  getSpindleTowerMesh: () => unknown;
  getSpindleTowerMeshes: () => unknown[];
  getSpindleTowerMeshByColor: (color: GearColor) => unknown;
  getSpindleBaseFlangeMesh: () => unknown;
  getSpindlePinMesh: () => unknown;
  getSnapshotGearCount: () => number;
  getSnapshotGearPosition: (id: string) => { x: number; y: number; z: number; bucket: string } | null;
  getSnapshotGearIds: () => string[];
  getSnapshotGearColor: (id: string) => GearColor | null;
  getSpawnedGearCount: () => number;
  getTowerGears: () => unknown[];
  getTowerGearCount: () => number;
  isGearAttached: () => boolean;
  wasGearEverAttached: () => boolean;
  getAttachedGearMesh: () => unknown;
  getTableMesh: () => unknown;
  getPedestalMesh: () => unknown;
  getLandingMatMesh: () => unknown;
  getReticleMesh: () => unknown;
  getGearMesh: () => unknown;
  getGearPosition: () => { x: number; y: number; z: number } | null;
  hasActiveGear: () => boolean;
  isLockedOut: () => boolean;
  clearWorkspace: () => void;
  simulatePointerMove: (x: number, y: number) => void;
  simulatePointerLeave: () => void;
  simulateClick: (x: number, y: number) => unknown;
  raycastPointer: (clientX: number, clientY: number) => VisualizerRaycastResult | null;
  getTableScreenCoords: (x: number, y: number) => { clientX: number; clientY: number } | null;
}

declare global {
  interface Window {
    __teleop_ws?: WebSocket;
    __robot_visualizer?: RobotVisualizerGlobalHandle;
  }
}
