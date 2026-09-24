import { useEffect, useRef, useState } from 'preact/hooks';
import * as THREE from 'three';
import type { URDFRobot } from 'urdf-loader';
import { isTestEnv } from '@utils/env';
import * as robotLoader from '@utils/robotLoader';
import {
  REACHABILITY_MIN_RADIUS,
  REACHABILITY_MAX_RADIUS,
  SPINDLE_TOWER_COORDS,
  SPINDLE_TOWERS,
  SCRAP_BIN_COORDS,
  TOWER_CAPACITY,
  GRASP_RIDE_OFFSET_Z_M,
} from '@/components/RobotVisualizer/constants';
import type {
  RobotVisualizerProps,
  WorkcellSnapshotView,
} from '@/components/RobotVisualizer/types';
import type { GearColor } from '@contracts';
import type { PalmProceduralAssets } from '@/components/RobotVisualizer/assets/palm';
import type { PedestalProceduralAssets } from '@/components/RobotVisualizer/assets/pedestal';
import type { TableProceduralAssets } from '@/components/RobotVisualizer/assets/table';
import type { SpindleTowerProceduralAssets } from '@/components/RobotVisualizer/assets/tower';
import type { ScrapBinProceduralAssets } from '@/components/RobotVisualizer/assets/scrapbin';
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
import { getTableCoordinates } from '@/components/RobotVisualizer/interaction/picking';
import { createPointerHandlers } from '@/components/RobotVisualizer/interaction/handlers';
import { createFrameState, stepFrame } from '@/components/RobotVisualizer/frame';
import { VisualizerErrorOverlay, VisualizerLoadingOverlay, type VisualizerErrorInfo } from '@/components/RobotVisualizer/overlays';
import { createVisualizerHandle } from '@/components/RobotVisualizer/handle';

export type { WorkcellSnapshotView };
export {
  REACHABILITY_MIN_RADIUS,
  REACHABILITY_MAX_RADIUS,
  SPINDLE_TOWER_COORDS,
  SPINDLE_TOWERS,
  SCRAP_BIN_COORDS,
  TOWER_CAPACITY,
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
  const [binNonEmpty, setBinNonEmpty] = useState<boolean>(false);

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
  const binNonEmptyRef = useRef<boolean>(false);

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
    let spindleTowerAssetsByColor: Record<GearColor, SpindleTowerProceduralAssets | null> | null = null;
    let scrapBinAssets: ScrapBinProceduralAssets | null = null;
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
    spindleTowerAssetsByColor = stage.spindleTowerAssetsByColor;
    scrapBinAssets = stage.scrapBinAssets;

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

    const pointerHandlers = createPointerHandlers({
      canvas,
      camera,
      robotGroup,
      getTableAssets: () => tableAssets,
      isDisposed: () => isDisposed,
      isIdle: () => !robotStatePropRef.current || robotStatePropRef.current === 'IDLE',
      isClickLocked: () => {
        const isIdle = !robotStatePropRef.current || robotStatePropRef.current === 'IDLE';
        return store.lockout || !isIdle;
      },
      onSpawn: (payload) => onSpawnObjectRef.current?.(payload),
      onDirty: () => {
        needsRender = true;
      },
    });
    pointerHandlers.attach();


    // Expose debug handle on window for testing and diagnostics
    const visualizerHandle = createVisualizerHandle({
      isLoaded: () => loadedRobot !== null,
      isDisposed: () => isDisposed,
      getRobot: () => loadedRobot,
      getScene: () => scene,
      getRenderer: () => renderer,
      getSpindle: () => spindleTowerAssets,
      getSpindlesByColor: () => ({
        WHITE: spindleTowerAssetsByColor?.WHITE ?? spindleTowerAssets,
        GREEN: spindleTowerAssetsByColor?.GREEN ?? null,
        BLUE: spindleTowerAssetsByColor?.BLUE ?? null,
      }),
      getTable: () => tableAssets,
      getPedestal: () => pedestalAssets,
      getScrapBin: () => scrapBinAssets,
      store,
      getLastRendered: () => Array.from(frame.lastRendered),
      isLocked: () => {
        const isIdle = !robotStatePropRef.current || robotStatePropRef.current === 'IDLE';
        return store.lockout || !isIdle;
      },
      simulatePointerMove: (x: number, y: number) => {
        pointerHandlers.handleMove(x, y);
      },
      simulatePointerLeave: () => {
        pointerHandlers.handleLeave();
      },
      simulateClick: (x: number, y: number) => {
        return pointerHandlers.handleClick(x, y);
      },
      raycastPointer: (clientX: number, clientY: number) => {
        const coords = getTableCoordinates(
          {
            canvas,
            camera,
            robotGroup,
            tableAssets,
            raycaster: new THREE.Raycaster(),
            pointerNdc: new THREE.Vector2(),
          },
          clientX,
          clientY,
        );
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
        scrapBin: scrapBinAssets,
        controls,
        onDirty: () => {
          needsRender = true;
        },
      });
      // OS-trash-style binary indicator: empty vs has-items, no count.
      // Derived from flat processed list via fixture state each frame.
      if (scrapBinAssets && scrapBinAssets.hasItems !== binNonEmptyRef.current) {
        binNonEmptyRef.current = scrapBinAssets.hasItems;
        setBinNonEmpty(scrapBinAssets.hasItems);
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

      pointerHandlers.detach();

      // Dispose snapshot-reconciled gear meshes
      for (const rec of store.gears.values()) {
        if (rec.assets.group.parent) {
          rec.assets.group.parent.remove(rec.assets.group);
        }
        rec.assets.dispose();
      }
      store.gears.clear();

      // Dispose SpindleTower fixture assets (all three color towers)
      if (spindleTowerAssetsByColor) {
        for (const tower of Object.values(spindleTowerAssetsByColor)) {
          if (tower) {
            if (tower.group.parent) {
              tower.group.parent.remove(tower.group);
            }
            tower.dispose();
          }
        }
        spindleTowerAssetsByColor = null;
      }
      spindleTowerAssets = null;

      if (scrapBinAssets) {
        if (scrapBinAssets.group.parent) {
          scrapBinAssets.group.parent.remove(scrapBinAssets.group);
        }
        scrapBinAssets.dispose();
        scrapBinAssets = null;
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
      <div
        data-testid="scrap-bin-indicator"
        data-state={binNonEmpty ? 'non-empty' : 'empty'}
        title={binNonEmpty ? 'Scrap bin: has items' : 'Scrap bin: empty'}
        style={{
          position: 'absolute',
          top: '0.75rem',
          right: '0.75rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.375rem',
          backgroundColor: 'rgba(17, 24, 39, 0.85)',
          border: `1px solid ${binNonEmpty ? '#f59e0b' : '#374151'}`,
          borderRadius: '0.375rem',
          padding: '0.375rem 0.625rem',
          color: binNonEmpty ? '#fbbf24' : '#9ca3af',
          fontSize: '0.75rem',
          fontWeight: 600,
          pointerEvents: 'none',
          zIndex: 4,
        }}
      >
        <span aria-hidden="true">{binNonEmpty ? '🗑️' : '🗑'}</span>
        <span>{binNonEmpty ? 'Scrap: has items' : 'Scrap: empty'}</span>
      </div>
    </div>
  );
}
