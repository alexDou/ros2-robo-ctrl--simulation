import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/preact';
import * as THREE from 'three';
import { RobotVisualizer } from '@components/RobotVisualizer';
import * as robotLoader from '@utils/robotLoader';
import { GEAR_CLASSIFIED_HEX, GEAR_GREY_HEX } from '@components/RobotVisualizer/assets/gear';
import { SPINDLE_TOWERS } from '@components/RobotVisualizer/constants';

function snapBuffer(spawned: any[] = [], inProgress: any[] = [], processed: any[] = []) {
  return {
    current: {
      jointPositions: [0, 0, 0, 0, 0, 0],
      palmState: { is_grasped: false },
      workcellState: { spawned, inProgress, processed, activeId: null },
    },
  };
}

function bodyHex(group: THREE.Group): number {
  const mesh = group.getObjectByName('gear-body') as THREE.Mesh;
  const mat = mesh.material as THREE.MeshStandardMaterial;
  return mat.color.getHex();
}

const GREY_BODY_HEX = GEAR_GREY_HEX.body;

describe('Unit 7.3b: Web recolor-on-echo', () => {
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

  it('table gear renders grey until echo, then adopts classified color matched by gear id', async () => {
    const telemetryBufferRef = snapBuffer([{ id: 'g1', x: 0.5, y: 0.0, z: 0.0 }]);
    const visualizer = await mountVisualizer(telemetryBufferRef);
    act(() => {
      stepFrame();
    });

    expect(bodyHex(visualizer.getGearMesh())).toBe(GREY_BODY_HEX);
    expect(visualizer.getSnapshotGearColor('g1')).toBeNull();

    act(() => {
      telemetryBufferRef.current.workcellState.spawned = [
        { id: 'g1', x: 0.5, y: 0.0, z: 0.0, color: 'GREEN', intact: true },
      ];
      stepFrame();
    });
    expect(visualizer.getSnapshotGearColor('g1')).toBe('GREEN');
    expect(bodyHex(visualizer.getGearMesh())).toBe(GEAR_CLASSIFIED_HEX.GREEN.body);
  });

  it('recolor matches by gear id: sibling gear without classification stays grey', async () => {
    const telemetryBufferRef = snapBuffer([
      { id: 'g1', x: 0.5, y: 0.0, z: 0.0, color: 'GREEN', intact: true },
      { id: 'g2', x: 0.55, y: 0.05, z: 0.0 },
    ]);
    const visualizer = await mountVisualizer(telemetryBufferRef);
    act(() => {
      stepFrame();
    });

    expect(visualizer.getSnapshotGearColor('g1')).toBe('GREEN');
    expect(visualizer.getSnapshotGearColor('g2')).toBeNull();
  });

  it('classified color survives spawned -> in_progress -> processed transitions', async () => {
    const telemetryBufferRef = snapBuffer([
      { id: 'g1', x: 0.5, y: 0.0, z: 0.0, color: 'BLUE', intact: true },
    ]);
    const visualizer = await mountVisualizer(telemetryBufferRef);
    act(() => {
      stepFrame();
    });
    expect(bodyHex(visualizer.getGearMesh())).toBe(GEAR_CLASSIFIED_HEX.BLUE.body);

    act(() => {
      telemetryBufferRef.current.workcellState.spawned = [];
      telemetryBufferRef.current.workcellState.inProgress = [
        { id: 'g1', x: 0.5, y: 0.0, z: 0.0, origin_x: 0.5, origin_y: 0.0, origin_z: 0.0, color: 'BLUE', intact: true },
      ];
      stepFrame();
    });
    expect(bodyHex(visualizer.getAttachedGearMesh())).toBe(GEAR_CLASSIFIED_HEX.BLUE.body);

    act(() => {
      telemetryBufferRef.current.workcellState.inProgress = [];
      telemetryBufferRef.current.workcellState.processed = [
        { id: 'g1', x: SPINDLE_TOWERS.BLUE.x, y: SPINDLE_TOWERS.BLUE.y, z: 0.0, origin_x: 0.5, origin_y: 0.0, origin_z: 0.0, color: 'BLUE', intact: true },
      ];
      stepFrame();
    });
    expect(bodyHex(visualizer.getTowerGears()[0])).toBe(GEAR_CLASSIFIED_HEX.BLUE.body);
    expect(visualizer.getSnapshotGearColor('g1')).toBe('BLUE');
  });

  it('processed gears render at tower positions by classification with matching colors', async () => {
    const telemetryBufferRef = snapBuffer([], [], [
      { id: 'w1', x: SPINDLE_TOWERS.WHITE.x, y: SPINDLE_TOWERS.WHITE.y, z: 0.0, color: 'WHITE', intact: true },
      { id: 'g1', x: SPINDLE_TOWERS.GREEN.x, y: SPINDLE_TOWERS.GREEN.y, z: 0.0, color: 'GREEN', intact: true },
      { id: 'b1', x: SPINDLE_TOWERS.BLUE.x, y: SPINDLE_TOWERS.BLUE.y, z: 0.0, color: 'BLUE', intact: true },
    ]);
    const visualizer = await mountVisualizer(telemetryBufferRef);
    act(() => {
      stepFrame();
    });

    expect(visualizer.getTowerGearCount()).toBe(3);
    const pos = (id: string) => visualizer.getSnapshotGearPosition(id);
    expect(pos('w1')!.x).toBeCloseTo(SPINDLE_TOWERS.WHITE.x, 4);
    expect(pos('g1')!.x).toBeCloseTo(SPINDLE_TOWERS.GREEN.x, 4);
    expect(pos('b1')!.x).toBeCloseTo(SPINDLE_TOWERS.BLUE.x, 4);
    const gears = visualizer.getTowerGears() as THREE.Group[];
    const hexes = gears.map((gr) => bodyHex(gr)).sort();
    const expected = [GEAR_CLASSIFIED_HEX.WHITE.body, GEAR_CLASSIFIED_HEX.GREEN.body, GEAR_CLASSIFIED_HEX.BLUE.body].sort();
    expect(hexes).toEqual(expected);
  });
});
