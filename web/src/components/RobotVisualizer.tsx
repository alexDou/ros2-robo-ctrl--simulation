import { useEffect, useRef, useState } from 'preact/hooks';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { URDFRobot } from 'urdf-loader';
import { UR5E_JOINTS } from '@contracts';
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

  // 1. Aluminum mounting plate (cylinder: radius 0.04m, height 0.015m, metallic finish)
  const plateGeom = new THREE.CylinderGeometry(0.04, 0.04, 0.015, 32);
  plateGeom.rotateX(Math.PI / 2);
  const plateMat = new THREE.MeshStandardMaterial({
    color: 0x9ca3af,
    metalness: 0.8,
    roughness: 0.2,
  });
  const plateMesh = new THREE.Mesh(plateGeom, plateMat);
  plateMesh.name = 'palm-baseplate';
  plateMesh.position.set(0, 0, 0.015 / 2);
  group.add(plateMesh);

  // 2. Pneumatic extension rod (cylinder: radius 0.01m, height 0.04m, dark metal finish)
  const rodGeom = new THREE.CylinderGeometry(0.01, 0.01, 0.04, 16);
  rodGeom.rotateX(Math.PI / 2);
  const rodMat = new THREE.MeshStandardMaterial({
    color: 0x374151,
    metalness: 0.6,
    roughness: 0.4,
  });
  const rodMesh = new THREE.Mesh(rodGeom, rodMat);
  rodMesh.name = 'palm-extension-rod';
  rodMesh.position.set(0, 0, 0.015 + 0.04 / 2);
  group.add(rodMesh);

  // 3. Industrial suction cup bellows nozzle (cylinder: radius 0.025m, height 0.02m, rubber finish)
  const nozzleGeom = new THREE.CylinderGeometry(0.015, 0.025, 0.02, 32);
  nozzleGeom.rotateX(Math.PI / 2);
  const nozzleMat = new THREE.MeshStandardMaterial({
    color: 0x1f2937,
    roughness: 0.9,
    metalness: 0.1,
    emissive: new THREE.Color(0x000000),
    emissiveIntensity: 0.0,
  });
  const nozzleMesh = new THREE.Mesh(nozzleGeom, nozzleMat);
  nozzleMesh.name = 'palm-suction-nozzle';
  nozzleMesh.position.set(0, 0, 0.015 + 0.04 + 0.02 / 2);
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

export function RobotVisualizer({
  urdfUrl = robotLoader.DEFAULT_UR5E_URDF_PATH,
  assetBaseUrl,
  jointPositionsRef,
  telemetryBufferRef,
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

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let isDisposed = false;
    let animId: number;
    let loadedRobot: URDFRobot | null = null;
    let palmAssets: PalmProceduralAssets | null = null;
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

        // Mount Dexterous Palm to tool0 flange link
        const tool0 =
          (robot.links && robot.links['tool0']) ||
          robot.getObjectByName('tool0');
        if (tool0) {
          palmAssets = createDexterousPalm();
          tool0.add(palmAssets.group);
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

      // Dispose procedural palm assets
      if (palmAssets) {
        if (palmAssets.group.parent) {
          palmAssets.group.parent.remove(palmAssets.group);
        }
        palmAssets.dispose();
        palmAssets = null;
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
