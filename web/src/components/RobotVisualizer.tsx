import { useEffect, useRef, useState } from 'preact/hooks';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { URDFRobot } from 'urdf-loader';
import { UR5E_JOINTS, type SpawnObjectPayload, type RobotState } from '@contracts';
import * as robotLoader from '@utils/robotLoader';

export interface RobotVisualizerProps {
  urdfUrl?: string;
  assetBaseUrl?: string;
  jointPositionsRef?: { current: readonly number[] };
  telemetryBufferRef?: {
    current: {
      jointPositions?: readonly number[];
      palmState?: { is_grasped: boolean };
    };
  };
  robotState?: RobotState | string;
  hasActiveGear?: boolean;
  onSpawnObject?: (payload: SpawnObjectPayload) => void;
  onRobotLoaded?: (robot: URDFRobot) => void;
  onSceneReady?: (
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    controls: OrbitControls,
    renderer: THREE.WebGLRenderer
  ) => void;
  rendererFactory?: (canvas: HTMLCanvasElement) => THREE.WebGLRenderer;
  controlsFactory?: (camera: THREE.PerspectiveCamera, domElement: HTMLElement) => OrbitControls;
  className?: string;
  style?: Record<string, string | number>;
}

function getLatestPositions(
  jointPositionsRef?: { current?: readonly number[] | null } | null,
  telemetryBufferRef?: { current?: { jointPositions?: readonly number[] } | null } | null
): readonly number[] | null {
  if (jointPositionsRef?.current && Array.isArray(jointPositionsRef.current)) {
    return jointPositionsRef.current;
  }
  if (
    telemetryBufferRef?.current?.jointPositions &&
    Array.isArray(telemetryBufferRef.current.jointPositions)
  ) {
    return telemetryBufferRef.current.jointPositions;
  }
  return null;
}

function disposeMaterial(mat: THREE.Material) {
  if (!mat) return;
  mat.dispose();
  for (const key of Object.keys(mat)) {
    const prop = (mat as unknown as Record<string, unknown>)[key];
    if (prop && typeof (prop as { dispose?: unknown }).dispose === 'function') {
      (prop as { dispose: () => void }).dispose();
    }
  }
}

interface PalmProceduralAssets {
  group: THREE.Group;
  nozzleMesh: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial>;
  dispose: () => void;
}

function createDexterousPalm(): PalmProceduralAssets {
  const group = new THREE.Group();
  group.name = 'dexterous-palm';

  // 1. Aluminum mounting plate (cylinder: radius 0.045m, height 0.018m, bright polished metallic finish)
  const plateGeom = new THREE.CylinderGeometry(0.045, 0.045, 0.018, 32);
  plateGeom.rotateX(Math.PI / 2);
  const plateMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    metalness: 0.85,
    roughness: 0.15,
  });
  const plateMesh = new THREE.Mesh(plateGeom, plateMat);
  plateMesh.name = 'palm-baseplate';
  plateMesh.position.set(0, 0, 0.018 / 2);
  group.add(plateMesh);

  // 2. Pneumatic extension rod (cylinder: radius 0.014m, height 0.055m, brushed chrome steel finish)
  const rodGeom = new THREE.CylinderGeometry(0.014, 0.014, 0.055, 24);
  rodGeom.rotateX(Math.PI / 2);
  const rodMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    metalness: 0.7,
    roughness: 0.25,
  });
  const rodMesh = new THREE.Mesh(rodGeom, rodMat);
  rodMesh.name = 'palm-extension-rod';
  rodMesh.position.set(0, 0, 0.018 + 0.055 / 2);
  group.add(rodMesh);

  // 3. Industrial suction cup bellows nozzle (cylinder: radius 0.020m to 0.035m, height 0.035m, distinct industrial suction cup)
  const nozzleGeom = new THREE.CylinderGeometry(0.020, 0.035, 0.035, 32);
  nozzleGeom.rotateX(Math.PI / 2);
  const nozzleMat = new THREE.MeshStandardMaterial({
    color: 0x3b82f6,
    roughness: 0.5,
    metalness: 0.2,
    emissive: new THREE.Color(0x000000),
    emissiveIntensity: 0.0,
  });
  const nozzleMesh = new THREE.Mesh(nozzleGeom, nozzleMat);
  nozzleMesh.name = 'palm-suction-nozzle';
  nozzleMesh.position.set(0, 0, 0.018 + 0.055 + 0.035 / 2);
  group.add(nozzleMesh);

  const dispose = () => {
    plateGeom.dispose();
    disposeMaterial(plateMat);
    rodGeom.dispose();
    disposeMaterial(rodMat);
    nozzleGeom.dispose();
    disposeMaterial(nozzleMat);
  };

  return { group, nozzleMesh, dispose };
}

interface TableProceduralAssets {
  tableMesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  reticleMesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  dispose: () => void;
}

function createWorkcellTable(): TableProceduralAssets {
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

  const bounds = {
    minX: centerX - slabSizeX / 2, // 0.15
    maxX: centerX + slabSizeX / 2, // 0.95
    minY: centerY - slabSizeY / 2, // -0.3
    maxY: centerY + slabSizeY / 2, // 0.3
  };

  const reticleGeom = new THREE.RingGeometry(0.035, 0.045, 32);
  const reticleMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
  });
  const reticleMesh = new THREE.Mesh(reticleGeom, reticleMat);
  reticleMesh.name = 'workcell-reticle';
  reticleMesh.visible = false;
  reticleMesh.position.set(centerX, centerY, 0.001);

  const dispose = () => {
    tableGeom.dispose();
    disposeMaterial(tableMat);
    reticleGeom.dispose();
    disposeMaterial(reticleMat);
  };

  return { tableMesh, reticleMesh, bounds, dispose };
}

interface GearwheelProceduralAssets {
  group: THREE.Group;
  dispose: () => void;
}

function createProceduralGearwheel(): GearwheelProceduralAssets {
  const group = new THREE.Group();
  group.name = 'gearwheel';

  const radius = 0.04;
  const height = 0.02;

  const bodyGeom = new THREE.CylinderGeometry(radius * 0.9, radius * 0.9, height, 24);
  bodyGeom.rotateX(Math.PI / 2);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    metalness: 0.7,
    roughness: 0.3,
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
    metalness: 0.75,
    roughness: 0.25,
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
    metalness: 0.9,
    roughness: 0.2,
  });
  const hubMesh = new THREE.Mesh(hubGeom, hubMat);
  hubMesh.name = 'gear-hub';
  hubMesh.position.set(0, 0, height / 2);
  group.add(hubMesh);

  const dispose = () => {
    bodyGeom.dispose();
    disposeMaterial(bodyMat);
    toothGeom.dispose();
    disposeMaterial(toothMat);
    hubGeom.dispose();
    disposeMaterial(hubMat);
  };

  return { group, dispose };
}

export function RobotVisualizer({
  urdfUrl = robotLoader.DEFAULT_UR5E_URDF_PATH,
  assetBaseUrl,
  jointPositionsRef,
  telemetryBufferRef,
  robotState,
  hasActiveGear,
  onSpawnObject,
  onRobotLoaded,
  onSceneReady,
  rendererFactory,
  controlsFactory,
  className,
  style,
}: RobotVisualizerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [errorInfo, setErrorInfo] = useState<{
    title: string;
    message: string;
    hint?: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const jointPositionsRefProp = useRef(jointPositionsRef);
  jointPositionsRefProp.current = jointPositionsRef;

  const telemetryBufferRefProp = useRef(telemetryBufferRef);
  telemetryBufferRefProp.current = telemetryBufferRef;

  const onRobotLoadedRef = useRef(onRobotLoaded);
  onRobotLoadedRef.current = onRobotLoaded;

  const onSceneReadyRef = useRef(onSceneReady);
  onSceneReadyRef.current = onSceneReady;

  const rendererFactoryRef = useRef(rendererFactory);
  rendererFactoryRef.current = rendererFactory;

  const controlsFactoryRef = useRef(controlsFactory);
  controlsFactoryRef.current = controlsFactory;

  const robotStatePropRef = useRef(robotState);
  robotStatePropRef.current = robotState;

  const hasActiveGearPropRef = useRef(hasActiveGear);
  hasActiveGearPropRef.current = hasActiveGear;

  const onSpawnObjectRef = useRef(onSpawnObject);
  onSpawnObjectRef.current = onSpawnObject;

  const clearWorkspaceRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let isDisposed = false;
    let animId: number;
    let loadedRobot: URDFRobot | null = null;
    let palmAssets: PalmProceduralAssets | null = null;
    let tableAssets: TableProceduralAssets | null = null;
    let activeGearAssets: GearwheelProceduralAssets | null = null;
    let isLockedOut = false;
    let wasGrasped = false;
    let needsRender = true;
    const lastRenderedPositions = new Float64Array(6).fill(NaN);

    // 1. Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111827);

    // 2. Camera setup
    const initialWidth = container.clientWidth || 800;
    const initialHeight = container.clientHeight || 600;
    const camera = new THREE.PerspectiveCamera(
      45,
      initialWidth / initialHeight,
      0.05,
      50
    );
    camera.position.set(1.4, 1.2, 1.4);

    // 3. Renderer instantiation
    let renderer: THREE.WebGLRenderer;
    try {
      if (rendererFactoryRef.current) {
        renderer = rendererFactoryRef.current(canvas);
      } else {
        renderer = new THREE.WebGLRenderer({
          canvas,
          antialias: true,
          alpha: true,
          powerPreference: 'default',
          failIfMajorPerformanceCaveat: false,
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(initialWidth, initialHeight, false);
      }
    } catch (err: unknown) {
      const error = err as Error;
      const isTest =
        (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') ||
        (typeof import.meta !== 'undefined' &&
          (import.meta as { env?: { MODE?: string } }).env?.MODE === 'test');
      if (!isTest) {
        console.error('RobotVisualizer: WebGL context creation failed:', error);
      }
      setErrorInfo({
        title: 'WebGL Context Unavailable',
        message:
          error?.message ||
          'Failed to initialize 3D WebGL context. Your browser or GPU driver has blocklisted WebGL.',
        hint: 'To enable WebGL in Chrome: visit chrome://flags, search for "Override software rendering list" (#ignore-gpu-blocklist), set to Enabled, and Relaunch. Alternatively launch Chrome from terminal with: google-chrome --ignore-gpu-blocklist',
      });
      setIsLoading(false);
      renderer = {
        domElement: canvas,
        setSize: () => {},
        setPixelRatio: () => {},
        render: () => {},
        dispose: () => {},
        forceContextLoss: () => {},
      } as unknown as THREE.WebGLRenderer;
    }

    // 4. OrbitControls
    let controls: OrbitControls;
    if (controlsFactoryRef.current) {
      controls = controlsFactoryRef.current(camera, canvas);
    } else {
      controls = new OrbitControls(camera, renderer.domElement);
    }
    // Centered on robot shoulder (approx y = 0.2m in Three.js WebGL frame)
    controls.target.set(0, 0.2, 0);
    // Polar limits prevent camera traversal below the ground plane (y <= 0)
    controls.minPolarAngle = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    // Zoom limits
    controls.minDistance = 0.3;
    controls.maxDistance = 3.0;
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    const onControlsChange = () => {
      needsRender = true;
    };
    if (controls && typeof controls.addEventListener === 'function') {
      controls.addEventListener('change', onControlsChange);
    }

    // 5. Calibrated 1m ground grid with 10cm subdivisions (1m size, 10 divisions)
    const gridHelper = new THREE.GridHelper(1.0, 10, 0x4b5563, 0x374151);
    gridHelper.position.y = 0;
    scene.add(gridHelper);

    // 6. Balanced lighting (diffuse ambient + key directional + soft fill)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(2.0, 4.0, 3.0);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x90cdf4, 0.4);
    fillLight.position.set(-2.0, 2.0, -2.0);
    scene.add(fillLight);

    // 7. Robot group adhering to REP-103 to WebGL conversion (rotation.x = -Math.PI / 2)
    const robotGroup = new THREE.Group();
    robotGroup.name = 'robot-root';
    robotGroup.rotation.x = -Math.PI / 2;
    scene.add(robotGroup);

    // Mount WorkcellTable and Dynamic Reticle to robotGroup
    tableAssets = createWorkcellTable();
    robotGroup.add(tableAssets.tableMesh);
    robotGroup.add(tableAssets.reticleMesh);

    // 8. Load UR5e robot model
    const loader = robotLoader.createRobotLoader({ assetBaseUrl });
    robotLoader.loadRobotModel(urdfUrl, loader)
      .then((robot) => {
        if (isDisposed) {
          robot.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) {
              if (Array.isArray(mesh.material)) {
                mesh.material.forEach(disposeMaterial);
              } else {
                disposeMaterial(mesh.material);
              }
            }
          });
          return;
        }
        loadedRobot = robot;
        robotGroup.add(robot);

        // Mount Dexterous Palm to tool0 flange link with fallback chain
        const mountLink =
          (robot.links && (robot.links['tool0'] || robot.links['flange'] || robot.links['wrist_3_link'])) ||
          robot.getObjectByName('tool0') ||
          robot.getObjectByName('flange') ||
          robot.getObjectByName('wrist_3_link');
        if (mountLink) {
          palmAssets = createDexterousPalm();
          mountLink.add(palmAssets.group);
        }

        needsRender = true;
        setIsLoading(false);
        if (onRobotLoadedRef.current) {
          onRobotLoadedRef.current(robot);
        }
      })
      .catch((err) => {
        const isTest =
          (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') ||
          (typeof import.meta !== 'undefined' &&
            (import.meta as { env?: { MODE?: string } }).env?.MODE === 'test');
        if (!isDisposed) {
          if (!isTest) {
            console.warn('RobotVisualizer failed to load URDF:', err);
          }
          setErrorInfo({
            title: 'Failed to Load Robot URDF',
            message: err instanceof Error ? err.message : String(err),
            hint: 'Ensure that static models under /models/ are accessible.',
          });
          setIsLoading(false);
        }
      });

    // Notify scene ready
    if (onSceneReadyRef.current) {
      onSceneReadyRef.current(scene, camera, controls, renderer);
    }

    const spawnGearAt = (x: number, y: number) => {
      if (activeGearAssets || isLockedOut || hasActiveGearPropRef.current) {
        return;
      }
      const gear = createProceduralGearwheel();
      gear.group.position.set(x, y, 0.0);
      robotGroup.add(gear.group);
      activeGearAssets = gear;
      isLockedOut = true;
      if (tableAssets) {
        tableAssets.reticleMesh.visible = false;
      }
      needsRender = true;

      if (onSpawnObjectRef.current) {
        onSpawnObjectRef.current({
          x,
          y,
          z: 0.0,
          object_type: 'GEAR',
        });
      }
    };

    const clearWorkspace = () => {
      if (activeGearAssets) {
        if (activeGearAssets.group.parent) {
          activeGearAssets.group.parent.remove(activeGearAssets.group);
        }
        activeGearAssets.dispose();
        activeGearAssets = null;
      }
      isLockedOut = false;
      needsRender = true;
    };
    clearWorkspaceRef.current = clearWorkspace;

    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();

    const getTableCoordinates = (clientX: number, clientY: number) => {
      if (!tableAssets) return null;
      const rect = canvas.getBoundingClientRect();
      const rectWidth = rect.width || canvas.width || 800;
      const rectHeight = rect.height || canvas.height || 600;
      pointerNdc.x = ((clientX - rect.left) / rectWidth) * 2 - 1;
      pointerNdc.y = -((clientY - rect.top) / rectHeight) * 2 + 1;

      camera.updateMatrixWorld();
      tableAssets.tableMesh.updateMatrixWorld(true);

      raycaster.setFromCamera(pointerNdc, camera);
      const intersects = raycaster.intersectObject(tableAssets.tableMesh, false);
      if (intersects.length === 0) return null;

      const localPoint = robotGroup.worldToLocal(intersects[0].point);
      if (Math.abs(localPoint.z) > 0.01) {
        return null;
      }
      return { x: localPoint.x, y: localPoint.y };
    };

    const handlePointerMoveCoords = (x: number, y: number) => {
      if (isDisposed || !tableAssets) return;
      const r = Math.sqrt(x * x + y * y);
      const isReachable = r >= 0.35 && r <= 0.75;
      const isInsideTable =
        x >= tableAssets.bounds.minX &&
        x <= tableAssets.bounds.maxX &&
        y >= tableAssets.bounds.minY &&
        y <= tableAssets.bounds.maxY;
      const isIdle = !robotStatePropRef.current || robotStatePropRef.current === 'IDLE';
      const isLocked = isLockedOut || Boolean(hasActiveGearPropRef.current);

      if (isReachable && isInsideTable && isIdle && !isLocked) {
        tableAssets.reticleMesh.position.set(x, y, 0.001);
        if (!tableAssets.reticleMesh.visible) {
          tableAssets.reticleMesh.visible = true;
        }
        needsRender = true;
      } else {
        if (tableAssets.reticleMesh.visible) {
          tableAssets.reticleMesh.visible = false;
          needsRender = true;
        }
      }
    };

    const handlePointerLeaveAction = () => {
      if (tableAssets && tableAssets.reticleMesh.visible) {
        tableAssets.reticleMesh.visible = false;
        needsRender = true;
      }
    };

    const handleClickCoords = (x: number, y: number) => {
      if (isDisposed || !tableAssets) return false;
      const isLocked = isLockedOut || Boolean(hasActiveGearPropRef.current);
      const isIdle = !robotStatePropRef.current || robotStatePropRef.current === 'IDLE';
      if (isLocked || !isIdle) return false;

      const r = Math.sqrt(x * x + y * y);
      const isReachable = r >= 0.35 && r <= 0.75;
      const isInsideTable =
        x >= tableAssets.bounds.minX &&
        x <= tableAssets.bounds.maxX &&
        y >= tableAssets.bounds.minY &&
        y <= tableAssets.bounds.maxY;

      if (isReachable && isInsideTable) {
        spawnGearAt(x, y);
        return true;
      }
      return false;
    };

    let pointerDownPos: { x: number; y: number } | null = null;

    const onPointerDown = (event: PointerEvent) => {
      pointerDownPos = { x: event.clientX, y: event.clientY };
    };

    const onPointerMove = (event: PointerEvent) => {
      if (isDisposed || !tableAssets) return;
      const coords = getTableCoordinates(event.clientX, event.clientY);
      if (coords) {
        handlePointerMoveCoords(coords.x, coords.y);
      } else {
        handlePointerLeaveAction();
      }
    };

    const onPointerLeave = () => {
      handlePointerLeaveAction();
    };

    const onCanvasClick = (event: MouseEvent) => {
      if (isDisposed || !tableAssets) return;
      if (pointerDownPos) {
        const dx = event.clientX - pointerDownPos.x;
        const dy = event.clientY - pointerDownPos.y;
        if (dx * dx + dy * dy > 16) {
          // Camera orbit drag was performed, ignore click
          return;
        }
      }
      const coords = getTableCoordinates(event.clientX, event.clientY);
      if (coords) {
        handleClickCoords(coords.x, coords.y);
      }
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('click', onCanvasClick);

    // Expose debug handle on window for testing and diagnostics
    const visualizerHandle = {
      isLoaded: () => loadedRobot !== null,
      isDisposed: () => isDisposed,
      getJointValue: (jointName: string): number | null => {
        if (!loadedRobot) return null;
        if (loadedRobot.joints && loadedRobot.joints[jointName]) {
          const j = loadedRobot.joints[jointName];
          return typeof j.angle === 'number' ? j.angle : (j.jointValue?.[0] ?? null);
        }
        return null;
      },
      getJointValues: (): Record<string, number> => {
        const result: Record<string, number> = {};
        if (!loadedRobot) return result;
        for (const j of UR5E_JOINTS) {
          if (loadedRobot.joints && loadedRobot.joints[j]) {
            const joint = loadedRobot.joints[j];
            result[j] = typeof joint.angle === 'number' ? joint.angle : (joint.jointValue?.[0] ?? 0);
          }
        }
        return result;
      },
      getLinkWorldPosition: (linkName: string): { x: number; y: number; z: number } | null => {
        if (!loadedRobot) return null;
        const link =
          (loadedRobot.links && loadedRobot.links[linkName]) ||
          loadedRobot.getObjectByName(linkName);
        if (!link) return null;
        const target = new THREE.Vector3();
        link.getWorldPosition(target);
        return { x: target.x, y: target.y, z: target.z };
      },
      getLastRenderedPositions: (): number[] => Array.from(lastRenderedPositions),
      getRendererInfo: () => {
        if (!renderer || !renderer.info) return null;
        return {
          memory: {
            geometries: renderer.info.memory?.geometries ?? 0,
            textures: renderer.info.memory?.textures ?? 0,
          },
          render: {
            calls: renderer.info.render?.calls ?? 0,
            triangles: renderer.info.render?.triangles ?? 0,
            frame: renderer.info.render?.frame ?? 0,
          },
        };
      },
      getScene: () => scene,
      getRenderer: () => renderer,
      getRobot: () => loadedRobot,
      getPalmNozzleState: (): { isGrasped: boolean; emissiveHex: number; emissiveIntensity: number } | null => {
        if (!loadedRobot) return null;
        const nozzle = loadedRobot.getObjectByName('palm-suction-nozzle') as THREE.Mesh | undefined;
        if (!nozzle || !nozzle.material || Array.isArray(nozzle.material)) return null;
        const mat = nozzle.material as THREE.MeshStandardMaterial;
        if (typeof mat.emissiveIntensity !== 'number' || !mat.emissive) return null;
        return {
          isGrasped: mat.emissiveIntensity > 0,
          emissiveHex: mat.emissive.getHex(),
          emissiveIntensity: mat.emissiveIntensity,
        };
      },
      getTableMesh: () => tableAssets?.tableMesh ?? null,
      getReticleMesh: () => tableAssets?.reticleMesh ?? null,
      getGearMesh: () => activeGearAssets?.group ?? null,
      getGearPosition: () => {
        if (!activeGearAssets) return null;
        const pos = activeGearAssets.group.position;
        return { x: pos.x, y: pos.y, z: pos.z };
      },
      hasActiveGear: () => activeGearAssets !== null,
      isLockedOut: () => isLockedOut,
      clearWorkspace: () => {
        clearWorkspace();
      },
      simulatePointerMove: (x: number, y: number) => {
        handlePointerMoveCoords(x, y);
      },
      simulatePointerLeave: () => {
        handlePointerLeaveAction();
      },
      simulateClick: (x: number, y: number) => {
        return handleClickCoords(x, y);
      },
      raycastPointer: (clientX: number, clientY: number) => {
        const coords = getTableCoordinates(clientX, clientY);
        if (!coords) return null;
        const r = Math.sqrt(coords.x * coords.x + coords.y * coords.y);
        return {
          x: coords.x,
          y: coords.y,
          z: 0.0,
          isReachable: r >= 0.35 && r <= 0.75,
          isInsideTable: coords.x >= 0.25 && coords.x <= 0.85 && coords.y >= -0.3 && coords.y <= 0.3,
        };
      },
    };

    if (typeof window !== 'undefined') {
      (window as unknown as { __robot_visualizer?: unknown }).__robot_visualizer = visualizerHandle;
    }

    // 9. ResizeObserver
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) {
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            renderer.setSize(width, height, false);
            needsRender = true;
          }
        }
      });
      resizeObserver.observe(container);
    }

    // 10. Animation render loop with dirty-checking
    const renderLoop = () => {
      if (isDisposed) return;

      // Check OrbitControls camera activity
      if (controls && typeof controls.update === 'function') {
        if (controls.update()) {
          needsRender = true;
        }
      }

      // Synchronize 6 canonical revolute joints with dirty checking
      const positions = getLatestPositions(
        jointPositionsRefProp.current,
        telemetryBufferRefProp.current
      );

      if (loadedRobot && positions) {
        let jointsChanged = false;
        const count = Math.min(UR5E_JOINTS.length, positions.length);
        for (let i = 0; i < count; i++) {
          const jointName = UR5E_JOINTS[i];
          const pos = positions[i];
          if (
            typeof pos === 'number' &&
            Number.isFinite(pos) &&
            (Number.isNaN(lastRenderedPositions[i]) || lastRenderedPositions[i] !== pos)
          ) {
            if (typeof loadedRobot.setJointValue === 'function') {
              loadedRobot.setJointValue(jointName, pos);
            } else if (
              loadedRobot.joints &&
              loadedRobot.joints[jointName] &&
              typeof loadedRobot.joints[jointName].setJointValue === 'function'
            ) {
              loadedRobot.joints[jointName].setJointValue(pos);
            }
            lastRenderedPositions[i] = pos;
            jointsChanged = true;
          }
        }
        if (jointsChanged) {
          loadedRobot.updateMatrixWorld(true);
          needsRender = true;
        }
      }

      // Synchronize Dexterous Palm grasp state with dirty-checking
      const currentGrasped = Boolean(
        telemetryBufferRefProp.current?.current?.palmState?.is_grasped
      );
      if (palmAssets && currentGrasped !== wasGrasped) {
        wasGrasped = currentGrasped;
        if (currentGrasped) {
          palmAssets.nozzleMesh.material.emissive.setHex(0x10b981);
          palmAssets.nozzleMesh.material.emissiveIntensity = 0.8;
        } else {
          palmAssets.nozzleMesh.material.emissive.setHex(0x000000);
          palmAssets.nozzleMesh.material.emissiveIntensity = 0.0;
        }
        needsRender = true;
      }

      // Render only when dirty, skipping static frames
      if (needsRender) {
        renderer.render(scene, camera);
        needsRender = false;
      }

      animId = requestAnimationFrame(renderLoop);
    };
    animId = requestAnimationFrame(renderLoop);

    // 11. Cleanup lifecycle on unmount
    return () => {
      isDisposed = true;
      cancelAnimationFrame(animId);

      if (typeof window !== 'undefined') {
        (window as unknown as { __robot_visualizer?: unknown }).__robot_visualizer = {
          ...visualizerHandle,
          isLoaded: () => false,
          isDisposed: () => true,
        };
      }

      if (resizeObserver) {
        resizeObserver.disconnect();
      }

      if (controls) {
        if (typeof controls.removeEventListener === 'function') {
          controls.removeEventListener('change', onControlsChange);
        }
        if (typeof controls.dispose === 'function') {
          controls.dispose();
        }
      }

      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('click', onCanvasClick);
      clearWorkspaceRef.current = null;

      // Dispose procedural palm assets
      if (palmAssets) {
        if (palmAssets.group.parent) {
          palmAssets.group.parent.remove(palmAssets.group);
        }
        palmAssets.dispose();
        palmAssets = null;
      }

      // Dispose active gear assets
      if (activeGearAssets) {
        if (activeGearAssets.group.parent) {
          activeGearAssets.group.parent.remove(activeGearAssets.group);
        }
        activeGearAssets.dispose();
        activeGearAssets = null;
      }

      // Dispose workcell table assets
      if (tableAssets) {
        if (tableAssets.tableMesh.parent) {
          tableAssets.tableMesh.parent.remove(tableAssets.tableMesh);
        }
        if (tableAssets.reticleMesh.parent) {
          tableAssets.reticleMesh.parent.remove(tableAssets.reticleMesh);
        }
        tableAssets.dispose();
        tableAssets = null;
      }

      // Dispose all geometries and materials across scene
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) {
          mesh.geometry.dispose();
        }
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(disposeMaterial);
          } else {
            disposeMaterial(mesh.material);
          }
        }
      });

      scene.clear();

      if (renderer) {
        if (typeof renderer.forceContextLoss === 'function') {
          renderer.forceContextLoss();
        }
        if (typeof renderer.dispose === 'function') {
          renderer.dispose();
        }
      }
    };
  }, [urdfUrl, assetBaseUrl]);

  useEffect(() => {
    if (hasActiveGear === false) {
      clearWorkspaceRef.current?.();
    }
  }, [hasActiveGear]);
  return (
    <div
      ref={containerRef}
      data-testid="robot-visualizer"
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: '400px',
        overflow: 'hidden',
        backgroundColor: '#111827',
        borderRadius: '0.5rem',
        ...style,
      }}
    >
      <canvas
        ref={canvasRef}
        data-testid="robot-canvas"
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
        }}
      />
      {errorInfo && (
        <div
          data-testid="visualizer-error-overlay"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(17, 24, 39, 0.94)',
            color: '#ef4444',
            padding: '1.5rem',
            textAlign: 'center',
            zIndex: 10,
          }}
        >
          <div style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            ⚠ {errorInfo.title}
          </div>
          <div style={{ color: '#e5e7eb', fontSize: '0.875rem', maxWidth: '480px', marginBottom: '0.75rem' }}>
            {errorInfo.message}
          </div>
          {errorInfo.hint && (
            <div
              style={{
                backgroundColor: 'rgba(31, 41, 55, 0.85)',
                border: '1px solid #374151',
                borderRadius: '0.375rem',
                padding: '0.75rem',
                color: '#93c5fd',
                fontSize: '0.75rem',
                maxWidth: '500px',
                textAlign: 'left',
                lineHeight: 1.4,
              }}
            >
              <span style={{ fontWeight: 600, color: '#60a5fa' }}>Action: </span>
              {errorInfo.hint}
            </div>
          )}
        </div>
      )}
      {isLoading && !errorInfo && (
        <div
          data-testid="visualizer-loading-overlay"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(17, 24, 39, 0.75)',
            color: '#9ca3af',
            fontSize: '0.875rem',
            pointerEvents: 'none',
            zIndex: 5,
          }}
        >
          <div
            style={{
              width: '28px',
              height: '28px',
              border: '3px solid #374151',
              borderTopColor: '#3b82f6',
              borderRadius: '50%',
              marginBottom: '0.5rem',
            }}
          />
          <span>Loading UR5e 3D Model...</span>
        </div>
      )}
    </div>
  );
}
