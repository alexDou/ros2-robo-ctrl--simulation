import { useEffect, useRef, useState } from 'preact/hooks';
import * as THREE from 'three';
import type { URDFRobot } from 'urdf-loader';
import { isTestEnv } from '@utils/env';
import * as robotLoader from '@utils/robotLoader';
import {
  SPINDLE_TOWER_COORDS,
  SPINDLE_TOWERS,
  SCRAP_BIN_COORDS,
  PALLET_CAPACITY,
  GRASP_RIDE_OFFSET_Z_M,
} from '@/components/RobotVisualizer/constants';
import type {
  RobotVisualizerProps,
  WorkcellSnapshotView,
} from '@/components/RobotVisualizer/types';
import type { GearColor } from '@contracts';

import type { PalmProceduralAssets } from '@/components/RobotVisualizer/assets/palm';
import type { PedestalProceduralAssets } from '@/components/RobotVisualizer/assets/pedestal';
import type { ConveyorProceduralAssets } from '@/components/RobotVisualizer/assets/conveyor';
import type { BeltGearsAssets } from '@/components/RobotVisualizer/assets/beltgears';
import type { HopperProceduralAssets } from '@/components/RobotVisualizer/assets/hopper';
import type { RearStandProceduralAssets } from '@/components/RobotVisualizer/assets/rearstand';
import type { SpindleTowerProceduralAssets } from '@/components/RobotVisualizer/assets/tower';
import type { DisplayPanelAssets } from '@/components/RobotVisualizer/assets/panel';
import type { ScrapBinProceduralAssets } from '@/components/RobotVisualizer/assets/scrapbin';
import {
  createStage,
  createRenderer,
  createControls,
  fallbackRenderer,
} from '@/components/RobotVisualizer/scene/stage';
import { loadRobot } from '@/components/RobotVisualizer/scene/robot';
import { disposeMaterial } from '@/utils/three/dispose';
import { binCount, towerCounts } from '@/utils/towerCounts';
import { DECK_SIZE } from '@utils/conveyorGating';
import {
  createSnapshotStore,
  readSnapshot,
  type SnapshotStore,
} from '@/components/RobotVisualizer/interaction/snapshot';
import { createFrameState, stepFrame } from '@/components/RobotVisualizer/frame';
import {
  VisualizerErrorOverlay,
  VisualizerLoadingOverlay,
  type VisualizerErrorInfo,
} from '@/components/RobotVisualizer/overlays';
import { createVisualizerHandle } from '@/components/RobotVisualizer/handle';

const GEAR_COLORS: readonly GearColor[] = ['WHITE', 'GREEN', 'BLUE'];

export type { WorkcellSnapshotView };
export {
  SPINDLE_TOWER_COORDS,
  SPINDLE_TOWERS,
  SCRAP_BIN_COORDS,
  PALLET_CAPACITY,
  GRASP_RIDE_OFFSET_Z_M,
};

export function RobotVisualizer({
  urdfUrl = robotLoader.DEFAULT_UR5E_URDF_PATH,
  assetBaseUrl,
  jointPositionsRef,
  telemetryBufferRef,
  robotState,
  hopperCount = 0,
  getBeltScroll,
  getBeltGears,
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
  const [counts, setCounts] = useState<Record<GearColor, number>>({ WHITE: 0, GREEN: 0, BLUE: 0 });

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

  const hopperCountRef = useRef(hopperCount);
  hopperCountRef.current = hopperCount;
  const getBeltScrollRef = useRef(getBeltScroll);
  getBeltScrollRef.current = getBeltScroll;
  const getBeltGearsRef = useRef(getBeltGears);
  getBeltGearsRef.current = getBeltGears;

  const prevRobotStateRef = useRef<string>(robotState || 'IDLE');
  const binNonEmptyRef = useRef<boolean>(false);
  const towerCountsRef = useRef<Record<GearColor, number>>({ WHITE: 0, GREEN: 0, BLUE: 0 });

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let isDisposed = false;
    let animId: number;
    let loadedRobot: URDFRobot | null = null;
    let palmAssets: PalmProceduralAssets | null = null;
    let pedestalAssets: PedestalProceduralAssets | null = null;
    let rearStandAssets: RearStandProceduralAssets | null = null;
    let conveyorAssets: ConveyorProceduralAssets | null = null;
    let hopperAssets: HopperProceduralAssets | null = null;
    let beltGearsAssets: BeltGearsAssets | null = null;
    let lastBeltScroll = 0;
    let spindleTowerAssets: SpindleTowerProceduralAssets | null = null;
    let spindleTowerAssetsByColor: Record<GearColor, SpindleTowerProceduralAssets | null> | null =
      null;
    let scrapBinAssets: ScrapBinProceduralAssets | null = null;
    let displayPanelAssets: DisplayPanelAssets | null = null;
    let mountLink: THREE.Object3D | null = null;
    // Workcell-authority (6.7.5): no local gear truth. Meshes reconcile
    // id-keyed from buffer workcellState each frame: spawned -> mesh
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
    rearStandAssets = stage.rearStandAssets;
    conveyorAssets = stage.conveyorAssets;
    hopperAssets = stage.hopperAssets;
    beltGearsAssets = stage.beltGearsAssets;
    hopperAssets.setCount(hopperCountRef.current);
    spindleTowerAssets = stage.spindleTowerAssets;
    spindleTowerAssetsByColor = stage.spindleTowerAssetsByColor;
    scrapBinAssets = stage.scrapBinAssets;
    displayPanelAssets = stage.displayPanelAssets;

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
      stage.cameraTarget,
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
      getPedestal: () => pedestalAssets,
      getRearStand: () => rearStandAssets,
      getConveyor: () => conveyorAssets,
      getHopper: () => hopperAssets,
      getBeltGears: () => beltGearsAssets,
      getConveyorScroll: () => lastBeltScroll,
      getScrapBin: () => scrapBinAssets,
      getDisplayPanel: () => displayPanelAssets,
      store,
      getLastRendered: () => Array.from(frame.lastRendered),
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

      // Tower counters n/10 derive from the authoritative processed list.
      const nextCounts = towerCounts(
        readSnapshot(
          telemetryBufferRefProp.current?.current
            ? { current: telemetryBufferRefProp.current.current }
            : undefined,
        ).processed,
      );
      if (displayPanelAssets) {
        const ws = readSnapshot(
          telemetryBufferRefProp.current?.current
            ? { current: telemetryBufferRefProp.current.current }
            : undefined,
        );
        const before = displayPanelAssets.getText().join('\n');
        displayPanelAssets.setValues({
          feederRemaining: hopperCountRef.current,
          binCount: binCount(ws.scrapped, ws.processed),
          palletCounts: nextCounts,
        });
        if (displayPanelAssets.getText().join('\n') !== before) needsRender = true;
      }
      const prevCounts = towerCountsRef.current;
      if (GEAR_COLORS.some((c) => nextCounts[c] !== prevCounts[c])) {
        towerCountsRef.current = nextCounts;
        setCounts(nextCounts);
      }

      // Belt surface and the gearwheels riding it follow cell_state (offset and tracked gears).
      if (beltGearsAssets && conveyorAssets) {
        const scroll = getBeltScrollRef.current?.() ?? 0;
        const gears = getBeltGearsRef.current?.() ?? [];
        if (
          scroll !== lastBeltScroll ||
          gears.length > 0 ||
          beltGearsAssets.group.children.length > 0
        ) {
          lastBeltScroll = scroll;
          conveyorAssets.setScroll(scroll);
          beltGearsAssets.sync(gears);
          needsRender = true;
        }
      }

      // FeedHopper fill level follows the deck count prop.
      if (hopperAssets) {
        const wanted = Math.min(1, Math.max(0, hopperCountRef.current / DECK_SIZE));
        if (hopperAssets.getFillLevel() !== wanted) {
          hopperAssets.setCount(hopperCountRef.current);
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

      // Dispose snapshot-reconciled gear meshes
      for (const rec of store.gears.values()) {
        if (rec.assets.group.parent) {
          rec.assets.group.parent.remove(rec.assets.group);
        }
        rec.assets.dispose();
      }
      store.gears.clear();
      for (const f of store.fading.values()) {
        if (f.assets.group.parent) f.assets.group.parent.remove(f.assets.group);
        f.assets.dispose();
      }
      store.fading.clear();

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

      if (displayPanelAssets) {
        displayPanelAssets.group.parent?.remove(displayPanelAssets.group);
        displayPanelAssets.dispose();
        displayPanelAssets = null;
      }
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

      if (conveyorAssets) {
        if (conveyorAssets.group.parent) {
          conveyorAssets.group.parent.remove(conveyorAssets.group);
        }
        conveyorAssets.dispose();
        conveyorAssets = null;
      }

      if (beltGearsAssets) {
        if (beltGearsAssets.group.parent) {
          beltGearsAssets.group.parent.remove(beltGearsAssets.group);
        }
        beltGearsAssets.dispose();
        beltGearsAssets = null;
      }

      if (hopperAssets) {
        if (hopperAssets.group.parent) {
          hopperAssets.group.parent.remove(hopperAssets.group);
        }
        hopperAssets.dispose();
        hopperAssets = null;
      }

      if (rearStandAssets) {
        if (rearStandAssets.group.parent) {
          rearStandAssets.group.parent.remove(rearStandAssets.group);
        }
        rearStandAssets.dispose();
        rearStandAssets = null;
      }

      // Dispose robot pedestal table assets
      if (pedestalAssets) {
        if (pedestalAssets.group.parent) {
          pedestalAssets.group.parent.remove(pedestalAssets.group);
        }
        pedestalAssets.dispose();
        pedestalAssets = null;
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
      <div
        data-testid="tower-counters"
        style={{
          position: 'absolute',
          top: '3.25rem',
          right: '0.75rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.25rem',
          backgroundColor: 'rgba(17, 24, 39, 0.85)',
          border: '1px solid #374151',
          borderRadius: '0.375rem',
          padding: '0.375rem 0.625rem',
          color: '#9ca3af',
          fontSize: '0.75rem',
          fontWeight: 600,
          pointerEvents: 'none',
          zIndex: 4,
        }}
      >
        {GEAR_COLORS.map((c) => (
          <span key={c} data-testid={`tower-counter-${c}`}>
            {c}: {counts[c]}/{PALLET_CAPACITY}
          </span>
        ))}
      </div>
    </div>
  );
}
