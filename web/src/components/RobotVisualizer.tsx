import { useEffect, useRef } from 'preact/hooks';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { URDFRobot } from 'urdf-loader';
import {
  DEFAULT_UR5E_URDF_PATH,
  createRobotLoader,
  loadRobotModel,
} from '@utils/robotLoader';

export interface RobotVisualizerProps {
  urdfUrl?: string;
  assetBaseUrl?: string;
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
  urdfUrl = DEFAULT_UR5E_URDF_PATH,
  assetBaseUrl,
  onRobotLoaded,
  onSceneReady,
  rendererFactory,
  controlsFactory,
  className,
  style,
}: RobotVisualizerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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
    const loader = createRobotLoader({ assetBaseUrl });
    loadRobotModel(urdfUrl, loader)
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
        robotGroup.add(robot);
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
          }
        }
      });
      resizeObserver.observe(container);
    }

    // 10. Animation render loop
    const renderLoop = () => {
      if (isDisposed) return;
      controls.update();
      renderer.render(scene, camera);
      animId = requestAnimationFrame(renderLoop);
    };
    animId = requestAnimationFrame(renderLoop);

    // 11. Cleanup lifecycle on unmount
    return () => {
      isDisposed = true;
      cancelAnimationFrame(animId);

      if (resizeObserver) {
        resizeObserver.disconnect();
      }

      if (controls && typeof controls.dispose === 'function') {
        controls.dispose();
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
