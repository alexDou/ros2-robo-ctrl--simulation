import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type * as THREE from 'three';
import type { URDFRobot } from 'urdf-loader';
import type { RobotState, GearEntry } from '@contracts';
import type { BeltFeeder } from '@utils/beltFeeder';

export interface WorkcellSnapshotView {
  spawned: GearEntry[];
  inProgress: GearEntry[];
  processed: GearEntry[];
  activeId: string | null;
}

export interface TelemetryBufferLike {
  current: {
    jointPositions?: readonly number[];
    palmState?: { is_grasped: boolean };
    phase?: string | null;
    workcellState?: WorkcellSnapshotView | null;
  };
}

export interface JointPositionsRefLike {
  current: readonly number[];
}

export interface RobotVisualizerProps {
  urdfUrl?: string;
  assetBaseUrl?: string;
  jointPositionsRef?: { current: readonly number[] };
  telemetryBufferRef?: TelemetryBufferLike;
  robotState?: RobotState | string;
  /** Gears currently in the FeedHopper deck; drives the hopper fill level. */
  hopperCount?: number;
  /** Client-local belt feeder: its gears and travel drive the belt gear meshes and surface animation. */
  beltFeederRef?: { current: BeltFeeder | null };
  onRobotLoaded?: (robot: URDFRobot) => void;
  onSceneReady?: (
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    controls: OrbitControls,
    renderer: THREE.WebGLRenderer,
  ) => void;
  rendererFactory?: (canvas: HTMLCanvasElement) => THREE.WebGLRenderer;
  controlsFactory?: (camera: THREE.PerspectiveCamera, domElement: HTMLElement) => OrbitControls;
  className?: string;
  style?: Record<string, string | number>;
}
