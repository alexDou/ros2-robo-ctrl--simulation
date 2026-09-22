import { useEffect, useRef, useState } from 'preact/hooks';
import * as THREE from 'three';
import type { URDFRobot } from 'urdf-loader';
import { isTestEnv } from '@utils/env';
import * as robotLoader from '@utils/robotLoader';
import {
  REACHABILITY_MIN_RADIUS,
  REACHABILITY_MAX_RADIUS,
  SPINDLE_TOWER_COORDS,
  GRASP_RIDE_OFFSET_Z_M,
} from '@/components/RobotVisualizer/constants';
import type {
  RobotVisualizerProps,
  WorkcellSnapshotView,
} from '@/components/RobotVisualizer/types';
import type { PalmProceduralAssets } from '@/components/RobotVisualizer/assets/palm';
import type { PedestalProceduralAssets } from '@/components/RobotVisualizer/assets/pedestal';
import type { TableProceduralAssets } from '@/components/RobotVisualizer/assets/table';
import type { SpindleTowerProceduralAssets } from '@/components/RobotVisualizer/assets/tower';
import {
  createStage,
  createRenderer,
  createControls,
  fallbackRenderer,
} from '@/components/RobotVisualizer/scene/stage';
import { loadRobot } from '@/components/RobotVisualizer/scene/robot';
import { disposeMaterial } from '@/utils/three/dispose';
import {
  createSnapshotStore,
  type SnapshotStore,
} from '@/components/RobotVisualizer/interaction/snapshot';
import {
  getTableCoordinates,
  isValidSpawnTarget,
  buildSpawnPayload,
  type PickingContext,
} from '@/components/RobotVisualizer/interaction/picking';
import { createFrameState, stepFrame } from '@/components/RobotVisualizer/frame';
import { VisualizerErrorOverlay, VisualizerLoadingOverlay, type VisualizerErrorInfo } from '@/components/RobotVisualizer/overlays';
import { createVisualizerHandle } from '@/components/RobotVisualizer/handle';

export type { WorkcellSnapshotView };
export {
  REACHABILITY_MIN_RADIUS,
  REACHABILITY_MAX_RADIUS,
  SPINDLE_TOWER_COORDS,
  GRASP_RIDE_OFFSET_Z_M,
};

export function RobotVisualizer({
  urdfUrl = robotLoader.DEFAULT_UR5E_URDF_PATH,
  assetBaseUrl,
  jointPositionsRef,
  telemetryBufferRef,
  robotState,
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

  const [errorInfo, setErrorInfo] = useState<VisualizerErrorInfo | null>(null);
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

  const onSpawnObjectRef = useRef(onSpawnObject);
  onSpawnObjectRef.current = onSpawnObject;

  const prevRobotStateRef = useRef<string>(robotState || 'IDLE');

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let isDisposed = false;
    let animId: number;
    let loadedRobot: URDFRobot | null = null;
    let palmAssets: PalmProceduralAssets | null = null;
    let pedestalAssets: PedestalProceduralAssets | null = null;
    let tableAssets: TableProceduralAssets | null = null;
    let spindleTowerAssets: SpindleTowerProceduralAssets | null = null;
    let mountLink: THREE.Object3D | null = null;
    // Workcell-authority (6.7.5): no local gear truth. Meshes reconcile
    // id-keyed from buffer workcellState each frame: spawned -> table mesh
    // at entry xyz, in_progress -> flange ride, processed -> tower verbatim.
    const store: SnapshotStore = createSnapshotStore();
    let needsRender = true;
    const frame = createFrameState();

    // 1-7. Stage: scene, camera, grid, lights, robot group + fixtures
    const stage = createStage(container);
    const scene = stage.scene;
    const camera = stage.camera;
    const robotGroup = stage.robotGroup;
    pedestalAssets = stage.pedestalAssets;
    tableAssets = stage.tableAssets;
    spindleTowerAssets = stage.spindleTowerAssets;

    // 3. Renderer instantiation
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = createRenderer(canvas, rendererFactoryRef.current);
    } catch (err: unknown) {
      const error = err as Error;
      if (!isTestEnv()) {
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
      renderer = fallbackRenderer(canvas);
    }

    // 4. OrbitControls
    const onControlsChange = () => {
      needsRender = true;
    };
    const controls = createControls(
      camera,
      canvas,
      renderer,
      controlsFactoryRef.current,
      onControlsChange,
    );

    // 8. Load UR5e robot model
    loadRobot({
      urdfUrl,
      assetBaseUrl,
      robotGroup,
      jointPositionsRef: jointPositionsRefProp.current,
      lastRendered: frame.lastRendered,
      isDisposed: () => isDisposed,
      onLoaded: (robot, mount) => {
        loadedRobot = robot;
        mountLink = mount.mountLink;
        palmAssets = mount.palmAssets;
        needsRender = true;
        setIsLoading(false);
        if (onRobotLoadedRef.current) {
          onRobotLoadedRef.current(robot);
        }
      },
      onError: (err) => {
        if (!isTestEnv()) {
          console.error('RobotVisualizer failed to load URDF:', err);
        }
        setErrorInfo({
          title: 'Failed to Load Robot URDF',
          message: err instanceof Error ? err.message : String(err),
          hint: 'Ensure that static models under /models/ are accessible.',
        });
        setIsLoading(false);
      },
    });

    // Notify scene ready
    if (onSceneReadyRef.current) {
      onSceneReadyRef.current(scene, camera, controls, renderer);
    }

    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();

    const pickingCtx = (): PickingContext => ({
      canvas,
      camera,
      robotGroup,
      tableAssets,
      raycaster,
      pointerNdc,
    });

    const isClickLocked = (): boolean => {
      const isIdle = !robotStatePropRef.current || robotStatePropRef.current === 'IDLE';
      return store.lockout || !isIdle;
    };

    const handlePointerMoveCoords = (x: number, y: number) => {
      if (isDisposed || !tableAssets) return;
      const table = tableAssets;
      const isIdle = !robotStatePropRef.current || robotStatePropRef.current === 'IDLE';
      const isLocked = isClickLocked();

      if (isValidSpawnTarget(table, x, y) && isIdle && !isLocked) {
        table.reticleMesh.position.set(x, y, 0.006);
        if (!table.reticleMesh.visible) {
          table.reticleMesh.visible = true;
        }
        needsRender = true;
      } else {
        if (table.reticleMesh.visible) {
          table.reticleMesh.visible = false;
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
      const isIdle = !robotStatePropRef.current || robotStatePropRef.current === 'IDLE';
      if (isClickLocked() || !isIdle) return false;

      if (isValidSpawnTarget(tableAssets, x, y)) {
        onSpawnObjectRef.current?.(buildSpawnPayload(x, y));
        if (tableAssets) tableAssets.reticleMesh.visible = false;
        needsRender = true;
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
      const coords = getTableCoordinates(pickingCtx(), event.clientX, event.clientY);
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
      const coords = getTableCoordinates(pickingCtx(), event.clientX, event.clientY);
      if (coords) {
        handleClickCoords(coords.x, coords.y);
      }
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('click', onCanvasClick);

    // Expose debug handle on window for testing and diagnostics
    const visualizerHandle = createVisualizerHandle({
      isLoaded: () => loadedRobot !== null,
      isDisposed: () => isDisposed,
      getRobot: () => loadedRobot,
      getScene: () => scene,
      getRenderer: () => renderer,
      getSpindle: () => spindleTowerAssets,
      getTable: () => tableAssets,
      getPedestal: () => pedestalAssets,
      store,
      getLastRendered: () => Array.from(frame.lastRendered),
      isLocked: () => isClickLocked(),
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
        const coords = getTableCoordinates(pickingCtx(), clientX, clientY);
        if (!coords || !tableAssets) return null;
        const r = Math.sqrt(coords.x * coords.x + coords.y * coords.y);
        const isInsideMat =
          coords.x >= tableAssets.matBounds.minX &&
          coords.x <= tableAssets.matBounds.maxX &&
          coords.y >= tableAssets.matBounds.minY &&
          coords.y <= tableAssets.matBounds.maxY;
        return {
          x: coords.x,
          y: coords.y,
          z: 0.0,
          isReachable: r >= REACHABILITY_MIN_RADIUS && r <= REACHABILITY_MAX_RADIUS,
          isInsideTable:
            coords.x >= tableAssets.bounds.minX &&
            coords.x <= tableAssets.bounds.maxX &&
            coords.y >= tableAssets.bounds.minY &&
            coords.y <= tableAssets.bounds.maxY,
          isInsideMat,
        };
      },
      getTableScreenCoords: (x: number, y: number): { clientX: number; clientY: number } | null => {
        if (!tableAssets || isDisposed) return null;
        camera.updateMatrixWorld();
        robotGroup.updateMatrixWorld(true);
        const p = new THREE.Vector3(x, y, 0.0);
        robotGroup.localToWorld(p);
        p.project(camera);
        if (p.z < -1 || p.z > 1 || Math.abs(p.x) > 1 || Math.abs(p.y) > 1) return null;
        const rect = canvas.getBoundingClientRect();
        return {
          clientX: rect.left + ((p.x + 1) * rect.width) / 2,
          clientY: rect.top + ((-p.y + 1) * rect.height) / 2,
        };
      },
    });

    if (typeof window !== 'undefined') {
      window.__robot_visualizer = visualizerHandle;
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

      stepFrame({
        frame,
        loadedRobot,
        jointPositionsRef: jointPositionsRefProp.current,
        bufferRef: telemetryBufferRefProp.current?.current
          ? { current: telemetryBufferRefProp.current.current }
          : undefined,
        palmAssets,
        store,
        robotGroup,
        mountLink,
        tableAssets,
        controls,
        onDirty: () => {
          needsRender = true;
        },
      });

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
        window.__robot_visualizer = {
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

      // Dispose snapshot-reconciled gear meshes
      for (const rec of store.gears.values()) {
        if (rec.assets.group.parent) {
          rec.assets.group.parent.remove(rec.assets.group);
        }
        rec.assets.dispose();
      }
      store.gears.clear();

      // Dispose SpindleTower fixture assets
      if (spindleTowerAssets) {
        if (spindleTowerAssets.group.parent) {
          spindleTowerAssets.group.parent.remove(spindleTowerAssets.group);
        }
        spindleTowerAssets.dispose();
        spindleTowerAssets = null;
      }

      // Dispose procedural palm assets
      if (palmAssets) {
        if (palmAssets.group.parent) {
          palmAssets.group.parent.remove(palmAssets.group);
        }
        palmAssets.dispose();
        palmAssets = null;
      }

      // Dispose robot pedestal table assets
      if (pedestalAssets) {
        if (pedestalAssets.group.parent) {
          pedestalAssets.group.parent.remove(pedestalAssets.group);
        }
        pedestalAssets.dispose();
        pedestalAssets = null;
      }

      // Dispose workcell table assets
      if (tableAssets) {
        if (tableAssets.tableMesh.parent) {
          tableAssets.tableMesh.parent.remove(tableAssets.tableMesh);
        }
        if (tableAssets.matMesh.parent) {
          tableAssets.matMesh.parent.remove(tableAssets.matMesh);
        }
        if (tableAssets.borderLines.parent) {
          tableAssets.borderLines.parent.remove(tableAssets.borderLines);
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
    // Workcell-authority: no IDLE safety net. Snapshot reconcile in the
    // render loop is the only gear mutator; this tracks prev state only.
    prevRobotStateRef.current = robotState || 'IDLE';
  }, [robotState]);
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
      {errorInfo && <VisualizerErrorOverlay error={errorInfo} />}
      {isLoading && !errorInfo && <VisualizerLoadingOverlay />}
    </div>
  );
}
