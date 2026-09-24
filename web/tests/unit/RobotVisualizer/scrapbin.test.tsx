import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, screen } from '@testing-library/preact';
import * as THREE from 'three';
import { RobotVisualizer } from '@components/RobotVisualizer';
import * as robotLoader from '@utils/robotLoader';
import { SCRAP_BIN } from '@contracts';
import { SCRAP_BIN_COORDS } from '@components/RobotVisualizer/constants';
import { createScrapBin } from '@components/RobotVisualizer/assets/scrapbin';

function snapBuffer(spawned: any[] = [], inProgress: any[] = [], processed: any[] = []) {
  return {
    current: {
      jointPositions: [0, 0, 0, 0, 0, 0],
      palmState: { is_grasped: false },
      workcellState: { spawned, inProgress, processed, activeId: null },
    },
  };
}

describe('Unit 7.3c: ScrapBin fixture + binary icon', () => {
  let mockRenderer: any;
  let mockControls: any;
  let rafCallbacks: ((time: number) => void)[] = [];
  let nextRafId = 1;

  beforeEach(() => {
    rafCallbacks = [];
    nextRafId = 1;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      const id = nextRafId++;
      rafCallbacks.push(cb as any);
      return id;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    mockRenderer = {
      domElement: document.createElement('canvas'),
      setSize: vi.fn(),
      setPixelRatio: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
      forceContextLoss: vi.fn(),
    };
    mockControls = {
      target: new THREE.Vector3(0, 0, 0),
      minDistance: 0,
      maxDistance: Infinity,
      maxPolarAngle: Math.PI,
      minPolarAngle: 0,
      enableDamping: false,
      update: vi.fn().mockReturnValue(false),
      dispose: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as any;
    const fakeTool0Link = new THREE.Object3D();
    fakeTool0Link.name = 'tool0';
    const fakeRobot = new THREE.Group() as any;
    fakeRobot.name = 'ur5e-mock';
    fakeRobot.links = { tool0: fakeTool0Link };
    fakeRobot.joints = {};
    fakeRobot.setJointValue = vi.fn();
    fakeRobot.add(fakeTool0Link);
    vi.spyOn(robotLoader, 'loadRobotModel').mockResolvedValue(fakeRobot as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const stepFrame = () => {
    const cbs = [...rafCallbacks];
    rafCallbacks.length = 0;
    cbs.forEach((cb) => cb(performance.now()));
  };

  async function mountVisualizer(telemetryBufferRef: any) {
    let resolveLoaded: () => void;
    const loadedPromise = new Promise<void>((res) => {
      resolveLoaded = res;
    });
    render(
      <RobotVisualizer
        telemetryBufferRef={telemetryBufferRef}
        rendererFactory={() => mockRenderer}
        controlsFactory={() => mockControls}
        onRobotLoaded={() => resolveLoaded()}
      />
    );
    await act(async () => {
      await loadedPromise;
    });
    return (window as any).__robot_visualizer;
  }

  it('canonical bin coords match domain SCRAP_BIN binding', () => {
    expect([SCRAP_BIN_COORDS.x, SCRAP_BIN_COORDS.y, SCRAP_BIN_COORDS.z]).toEqual([...SCRAP_BIN]);
  });

  it('builder mounts open bin at canonical coords, empty state initially', () => {
    const bin = createScrapBin();
    expect(bin.group.name).toBe('scrap-bin');
    expect(bin.group.position.x).toBeCloseTo(0.4, 4);
    expect(bin.group.position.y).toBeCloseTo(0.28, 4);
    expect(bin.group.position.z).toBeCloseTo(0.0, 4);
    expect(bin.hasItems).toBe(false);
    expect(bin.group.getObjectByName('scrap-bin-fill')!.visible).toBe(false);
    bin.dispose();
  });

  it('stage mounts bin fixture; legacy tower probes unaffected', async () => {
    const visualizer = await mountVisualizer(snapBuffer());
    const bin = visualizer.getScrapBinMesh();
    expect(bin).toBeDefined();
    expect(bin).not.toBeNull();
    expect(bin.name).toBe('scrap-bin');
    expect(bin.position.x).toBeCloseTo(0.4, 2);
    expect(bin.position.y).toBeCloseTo(0.28, 2);
    expect(visualizer.getSpindleTowerMeshes()).toHaveLength(3);
  });

  it('indicator empty with no rejects; sound-only processed stays empty with no digits', async () => {
    const telemetryBufferRef = snapBuffer([], [], [
      { id: 'w1', x: 0.4, y: -0.3, z: 0.0, color: 'WHITE', intact: true },
    ]);
    const visualizer = await mountVisualizer(telemetryBufferRef);
    act(() => {
      stepFrame();
    });
    expect(visualizer.isScrapBinNonEmpty()).toBe(false);
    const indicator = screen.getByTestId('scrap-bin-indicator');
    expect(indicator.getAttribute('data-state')).toBe('empty');
    expect(indicator.textContent).toMatch(/empty/i);
    expect(indicator.textContent).not.toMatch(/\d/);
  });

  it('first defective arrival renders into bin pile and flips icon to non-empty, no count', async () => {
    const telemetryBufferRef = snapBuffer();
    const visualizer = await mountVisualizer(telemetryBufferRef);
    act(() => {
      stepFrame();
    });
    expect(visualizer.isScrapBinNonEmpty()).toBe(false);
    act(() => {
      telemetryBufferRef.current.workcellState.processed = [
        { id: 'd1', x: SCRAP_BIN[0], y: SCRAP_BIN[1], z: 0.0, color: 'GREEN', intact: false },
      ];
      stepFrame();
    });
    const pos = visualizer.getSnapshotGearPosition('d1');
    expect(pos!.x).toBeCloseTo(SCRAP_BIN[0], 4);
    expect(pos!.y).toBeCloseTo(SCRAP_BIN[1], 4);
    expect(visualizer.isScrapBinNonEmpty()).toBe(true);
    const indicator = screen.getByTestId('scrap-bin-indicator');
    expect(indicator.getAttribute('data-state')).toBe('non-empty');
    expect(indicator.textContent).toMatch(/has items/i);
    expect(indicator.textContent).not.toMatch(/\d/);
  });

  it('clearing workspace returns icon to empty', async () => {
    const telemetryBufferRef = snapBuffer([], [], [
      { id: 'd1', x: SCRAP_BIN[0], y: SCRAP_BIN[1], z: 0.0, color: 'BLUE', intact: false },
    ]);
    const visualizer = await mountVisualizer(telemetryBufferRef);
    act(() => {
      stepFrame();
    });
    expect(visualizer.isScrapBinNonEmpty()).toBe(true);
    act(() => {
      telemetryBufferRef.current.workcellState.processed = [];
      stepFrame();
    });
    expect(visualizer.isScrapBinNonEmpty()).toBe(false);
    const indicator = screen.getByTestId('scrap-bin-indicator');
    expect(indicator.getAttribute('data-state')).toBe('empty');
    expect(visualizer.getSnapshotGearCount()).toBe(0);
  });

  it('disposes bin geometries and materials on unmount', async () => {
    let unmountFn: () => void;
    let resolveLoaded: () => void;
    const loadedPromise = new Promise<void>((res) => {
      resolveLoaded = res;
    });
    await act(async () => {
      const res = render(
        <RobotVisualizer
          rendererFactory={() => mockRenderer}
          controlsFactory={() => mockControls}
          onRobotLoaded={() => resolveLoaded()}
        />
      );
      unmountFn = res.unmount;
    });
    await act(async () => {
      await loadedPromise;
    });
    const visualizer = (window as any).__robot_visualizer;
    const bin = visualizer.getScrapBinMesh();
    const wall = bin.getObjectByName('scrap-bin-wall-0') as THREE.Mesh;
    const geomSpy = vi.spyOn(wall.geometry, 'dispose');
    const matSpy = vi.spyOn(wall.material as THREE.Material, 'dispose');
    act(() => {
      unmountFn!();
    });
    expect(geomSpy).toHaveBeenCalled();
    expect(matSpy).toHaveBeenCalled();
  });
});
