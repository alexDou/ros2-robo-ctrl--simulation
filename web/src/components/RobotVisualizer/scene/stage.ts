import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { PalmProceduralAssets } from '@/components/RobotVisualizer/assets/palm';
import type { ConveyorProceduralAssets } from '@/components/RobotVisualizer/assets/conveyor';
import type { BeltGearsAssets } from '@/components/RobotVisualizer/assets/beltgears';
import type { DisplayPanelAssets } from '@/components/RobotVisualizer/assets/panel';
import type { HopperProceduralAssets } from '@/components/RobotVisualizer/assets/hopper';
import type { RearStandProceduralAssets } from '@/components/RobotVisualizer/assets/rearstand';
import type { PedestalProceduralAssets } from '@/components/RobotVisualizer/assets/pedestal';
import type { SpindleTowerProceduralAssets } from '@/components/RobotVisualizer/assets/tower';
import type { ScrapBinProceduralAssets } from '@/components/RobotVisualizer/assets/scrapbin';
import { createConveyor } from '@/components/RobotVisualizer/assets/conveyor';
import { createBeltGears } from '@/components/RobotVisualizer/assets/beltgears';
import { createDisplayPanel } from '@/components/RobotVisualizer/assets/panel';
import { createHopper } from '@/components/RobotVisualizer/assets/hopper';
import { createRearStand } from '@/components/RobotVisualizer/assets/rearstand';
import { createRobotPedestal } from '@/components/RobotVisualizer/assets/pedestal';
import { createSpindleTower } from '@/components/RobotVisualizer/assets/tower';
import { createScrapBin } from '@/components/RobotVisualizer/assets/scrapbin';
import { DEFAULT_CAMERA_POSE, repToWorld } from '@/components/RobotVisualizer/scene/cameraPose';
import type { GearColor } from '@contracts';

export interface StageAssets {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** World-space point the camera looks at by default (orbit target). */
  cameraTarget: THREE.Vector3;
  robotGroup: THREE.Group;
  pedestalAssets: PedestalProceduralAssets;
  rearStandAssets: RearStandProceduralAssets;
  conveyorAssets: ConveyorProceduralAssets;
  hopperAssets: HopperProceduralAssets;
  beltGearsAssets: BeltGearsAssets;
  spindleTowerAssets: SpindleTowerProceduralAssets;
  spindleTowerAssetsByColor: Record<GearColor, SpindleTowerProceduralAssets>;
  scrapBinAssets: ScrapBinProceduralAssets;
  displayPanelAssets: DisplayPanelAssets;
}

export function createStage(container: HTMLDivElement): StageAssets {
  // 1. Scene setup
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111827);

  // 2. Camera setup
  const initialWidth = container.clientWidth || 800;
  const initialHeight = container.clientHeight || 600;
  const camera = new THREE.PerspectiveCamera(45, initialWidth / initialHeight, 0.05, 50);

  // 5. Calibrated ground floor grid with 10cm subdivisions (2m size, 20 divisions)
  // Positioned at floor level (y = -0.255m) beneath the pedestal foot
  const gridHelper = new THREE.GridHelper(2.0, 20, 0x4b5563, 0x374151);
  gridHelper.position.set(0, -0.255, 0);
  scene.add(gridHelper);

  // 6. Balanced lighting (diffuse ambient + key directional + neutral fill)
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
  scene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
  keyLight.position.set(2.0, 4.0, 3.0);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xffffff, 0.45);
  fillLight.position.set(-2.0, 3.0, -2.0);
  scene.add(fillLight);

  // 7. Robot group adhering to REP-103 to WebGL conversion (rotation.x = -Math.PI / 2)
  const robotGroup = new THREE.Group();
  robotGroup.name = 'robot-root';
  robotGroup.rotation.x = -Math.PI / 2;
  scene.add(robotGroup);

  // Mount Robot Pedestal Table to robotGroup
  const pedestalAssets = createRobotPedestal();
  robotGroup.add(pedestalAssets.group);

  // Rear stand carrying the towers (top flush at Z = 0)
  const rearStandAssets = createRearStand();
  robotGroup.add(rearStandAssets.group);

  // Static conveyor in front of the arm (belt top at Z = 0)
  const conveyorAssets = createConveyor();
  robotGroup.add(conveyorAssets.group);

  // FeedHopper at the belt's upstream end
  const hopperAssets = createHopper();
  robotGroup.add(hopperAssets.group);

  // Client-local gears riding the belt (before workcell registration)
  const beltGearsAssets = createBeltGears();
  robotGroup.add(beltGearsAssets.group);

  // Mount three color SpindleTowers at canonical WHITE/GREEN/BLUE coords.
  // WHITE keeps legacy position so single-tower scene renders identically.
  const whiteTower = createSpindleTower('WHITE');
  const greenTower = createSpindleTower('GREEN');
  const blueTower = createSpindleTower('BLUE');
  robotGroup.add(whiteTower.group);
  robotGroup.add(greenTower.group);
  robotGroup.add(blueTower.group);
  const spindleTowerAssets = whiteTower;
  const spindleTowerAssetsByColor = { WHITE: whiteTower, GREEN: greenTower, BLUE: blueTower };

  // ScrapBin fixture at canonical SCRAP_BIN coords (open box/chute).
  const scrapBinAssets = createScrapBin();
  robotGroup.add(scrapBinAssets.group);

  const displayPanelAssets = createDisplayPanel();
  robotGroup.add(displayPanelAssets.group);

  const cameraTarget = repToWorld(robotGroup, DEFAULT_CAMERA_POSE.target);
  camera.position.copy(repToWorld(robotGroup, DEFAULT_CAMERA_POSE.position));
  camera.lookAt(cameraTarget);

  return {
    scene,
    camera,
    cameraTarget,
    robotGroup,
    pedestalAssets,
    rearStandAssets,
    conveyorAssets,
    hopperAssets,
    beltGearsAssets,
    spindleTowerAssets,
    spindleTowerAssetsByColor,
    scrapBinAssets,
    displayPanelAssets,
  };
}

export function createRenderer(
  canvas: HTMLCanvasElement,
  rendererFactory?: (canvas: HTMLCanvasElement) => THREE.WebGLRenderer,
): THREE.WebGLRenderer {
  if (rendererFactory) {
    return rendererFactory(canvas);
  }
  const container = canvas.parentElement;
  const initialWidth = container?.clientWidth || 800;
  const initialHeight = container?.clientHeight || 600;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'default',
    failIfMajorPerformanceCaveat: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(initialWidth, initialHeight, false);
  return renderer;
}

export function createControls(
  camera: THREE.PerspectiveCamera,
  domElement: HTMLElement,
  renderer: THREE.WebGLRenderer,
  controlsFactory?: (camera: THREE.PerspectiveCamera, domElement: HTMLElement) => OrbitControls,
  onChange?: () => void,
  target: THREE.Vector3 = new THREE.Vector3(0, 0.2, 0),
): OrbitControls {
  let controls: OrbitControls;
  if (controlsFactory) {
    controls = controlsFactory(camera, domElement);
  } else {
    controls = new OrbitControls(camera, renderer.domElement);
  }
  controls.target.copy(target);
  // Polar limits prevent camera traversal below the ground plane (y <= 0)
  controls.minPolarAngle = 0.05;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  // Zoom limits
  controls.minDistance = 0.3;
  controls.maxDistance = 3.0;
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  if (onChange && typeof controls.addEventListener === 'function') {
    controls.addEventListener('change', onChange);
  }
  return controls;
}

export function fallbackRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  return {
    domElement: canvas,
    setSize: () => {},
    setPixelRatio: () => {},
    render: () => {},
    dispose: () => {},
    forceContextLoss: () => {},
  } as unknown as THREE.WebGLRenderer;
}

export interface LoadedRobotMount {
  mountLink: THREE.Object3D | null;
  palmAssets: PalmProceduralAssets | null;
}

export type { PalmProceduralAssets };
