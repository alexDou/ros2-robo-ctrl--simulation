import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/preact';
import * as THREE from 'three';
import { RobotVisualizer } from '@components/RobotVisualizer';
import * as robotLoader from '@utils/robotLoader';

function snapBuffer(spawned: any[] = [], inProgress: any[] = [], processed: any[] = []) {
  return {
    current: {
      jointPositions: [0, 0, 0, 0, 0, 0],
      palmState: { is_grasped: false },
      workcellState: { spawned, inProgress, processed, activeId: null },
    },
  };
}

describe('Unit 9.08: scene gears follow cell_state (hand-sim-o9vg)', () => {
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

  async function mountVisualizer(telemetryBufferRef: any, getBeltGears?: () => any[]) {
    let resolveLoaded: () => void;
    const loadedPromise = new Promise<void>((res) => {
      resolveLoaded = res;
    });
    render(
      <RobotVisualizer
        telemetryBufferRef={telemetryBufferRef}
        getBeltGears={getBeltGears}
        rendererFactory={() => mockRenderer}
        controlsFactory={() => mockControls}
        onRobotLoaded={() => resolveLoaded()}
      />,
    );
    await act(async () => {
      await loadedPromise;
    });
    return (window as any).__robot_visualizer;
  }

  it('renders one mesh per tracked gear at its reported position and follows updates', async () => {
    let gears: any[] = [
      { id: 'belt-1', x: 0.4, y: 0.6, color: 'GREEN', intact: true },
      { id: 'belt-2', x: 0.35, y: 0.2, color: 'BLUE', intact: false },
    ];
    const viz = await mountVisualizer(snapBuffer(), () => gears);

    await act(async () => stepFrame());
    expect(viz.getBeltGearPositions()).toMatchObject([
      { x: 0.4, y: 0.6, color: 'GREEN', intact: true },
      { x: 0.35, y: 0.2, color: 'BLUE', intact: false },
    ]);

    gears = [{ id: 'belt-1', x: 0.4, y: 0.45, color: 'GREEN', intact: true }];
    await act(async () => stepFrame());
    expect(viz.getBeltGearPositions()).toHaveLength(1);
    expect(viz.getBeltGearPositions()[0].y).toBeCloseTo(0.45);
  });
});
