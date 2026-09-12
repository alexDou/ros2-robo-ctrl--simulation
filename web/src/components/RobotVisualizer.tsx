import { useEffect, useRef } from 'preact/hooks';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { URDFRobot } from 'urdf-loader';
import { UR5E_JOINTS } from '@contracts';
import * as robotLoader from '@utils/robotLoader';

export interface RobotVisualizerProps {
  urdfUrl?: string;
  assetBaseUrl?: string;
  jointPositionsRef?: { current: readonly number[] };
  telemetryBufferRef?: { current: { jointPositions: readonly number[] } };
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
    if (rendererFactoryRef.current) {
      renderer = rendererFactoryRef.current(canvas);
    } else {
      try {
        renderer = new THREE.WebGLRenderer({
          canvas,
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(initialWidth, initialHeight, false);
      } catch {
        renderer = {
          domElement: canvas,
          setSize: () => {},
          setPixelRatio: () => {},
          render: () => {},
          dispose: () => {},
          forceContextLoss: () => {},
        } as unknown as THREE.WebGLRenderer;
      }
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
        needsRender = true;
        if (onRobotLoadedRef.current) {
          onRobotLoadedRef.current(robot);
        }
      })
      .catch((err) => {
        const isTest =
          (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') ||
          (typeof import.meta !== 'undefined' &&
            (import.meta as { env?: { MODE?: string } }).env?.MODE === 'test');
        if (!isDisposed && !isTest) {
          console.warn('RobotVisualizer failed to load URDF:', err);
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
    </div>
  );
}
