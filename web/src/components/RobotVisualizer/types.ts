import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type * as THREE from 'three';
import type { URDFRobot } from 'urdf-loader';
import type { SpawnObjectPayload, RobotState, GearEntry } from '@contracts';

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
  onSpawnObject?: (payload: SpawnObjectPayload) => void;
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
