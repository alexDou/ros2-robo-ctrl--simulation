import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/preact';
import * as THREE from 'three';
import { RobotVisualizer } from '@components/RobotVisualizer';
import * as robotLoader from '@utils/robotLoader';
import { createPalletLanes } from '@components/RobotVisualizer/assets/palletlanes';
import {
  PALLET_LANE_TRAVEL_M,
  PALLET_LEAVE_MS,
  SPINDLE_TOWERS,
} from '@components/RobotVisualizer/constants';
import type { ExchangeState } from '@contracts';

const stackGear = (id: string, z: number) => ({
  id,
  x: SPINDLE_TOWERS.GREEN.x,
  y: SPINDLE_TOWERS.GREEN.y,
  z,
  color: 'GREEN',
  intact: true,
});

const gearMeshes = (viz: any) => {
  const tower = viz.getSpindleTowerMeshByColor('GREEN') as THREE.Group;
  return tower.parent!.children.filter((c) => c.getObjectByName('gear-body'));
};

describe('Unit 9.16: PalletLanes asset', () => {
  it('runs each lane from its PalletStation along -X, inside the 0.16 m pitch', () => {
    const lanes = createPalletLanes();
    for (const color of ['WHITE', 'GREEN', 'BLUE'] as const) {
      const lane = lanes.lanes[color];
      const box = new THREE.Box3().setFromObject(lane);
      expect(box.max.x).toBeCloseTo(SPINDLE_TOWERS[color].x, 3);
      expect(box.min.x).toBeCloseTo(SPINDLE_TOWERS[color].x - PALLET_LANE_TRAVEL_M, 3);
      expect(lane.position.y).toBeCloseTo(SPINDLE_TOWERS[color].y, 5);
    }
    const widths = (['WHITE', 'GREEN', 'BLUE'] as const).map((c) => {
      const b = new THREE.Box3().setFromObject(lanes.lanes[c]);
      return b.max.y - b.min.y;
    });
    expect(Math.max(...widths)).toBeLessThan(0.16);
    lanes.dispose();
  });
});

describe('Unit 9.16: Pallet follows the station exchange state in the scene', () => {
  let rafCallbacks: ((time: number) => void)[] = [];
  const stepFrame = () => rafCallbacks.splice(0).forEach((cb) => cb(performance.now()));
  let now = 0;

  beforeEach(() => {
    rafCallbacks = [];
    now = 10_000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      rafCallbacks.push(cb as any);
      return rafCallbacks.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as any;
    const tool0 = new THREE.Object3D();
    tool0.name = 'tool0';
    const robot = new THREE.Group() as any;
    robot.links = { tool0 };
    robot.joints = {};
    robot.setJointValue = vi.fn();
    robot.add(tool0);
    vi.spyOn(robotLoader, 'loadRobotModel').mockResolvedValue(robot);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function mount() {
    const buffer: any = {
      current: {
        jointPositions: [0, 0, 0, 0, 0, 0],
        palmState: { is_grasped: false },
        workcellState: {
          spawned: [],
          inProgress: [],
          processed: [stackGear('g0', 0), stackGear('g1', 0.02)],
          activeId: null,
        },
        cellState: null,
      },
    };
    let resolveLoaded!: () => void;
    const loaded = new Promise<void>((res) => (resolveLoaded = res));
    render(
      <RobotVisualizer
        telemetryBufferRef={buffer}
        rendererFactory={() =>
          ({
            domElement: document.createElement('canvas'),
            setSize: vi.fn(),
            setPixelRatio: vi.fn(),
            render: vi.fn(),
            dispose: vi.fn(),
            forceContextLoss: vi.fn(),
          }) as any
        }
        controlsFactory={() =>
          ({ update: vi.fn(), dispose: vi.fn(), target: new THREE.Vector3() }) as any
        }
        onRobotLoaded={() => resolveLoaded()}
      />,
    );
    await act(async () => {
      await loaded;
    });
    const report = (green: ExchangeState) => {
      buffer.current.cellState = {
        stations: [
          { name: 'WHITE', exchange_state: 'HOME', count: 0 },
          { name: 'GREEN', exchange_state: green, count: 2 },
          { name: 'BLUE', exchange_state: 'HOME', count: 0 },
        ],
      };
      act(() => stepFrame());
    };
    return { viz: (window as any).__robot_visualizer, report };
  }

  it('shows the lanes and keeps the Pallet at its station while HOME', async () => {
    const { viz, report } = await mount();
    report('HOME');
    expect(viz.getPalletLaneMesh('GREEN')).toBeTruthy();
    expect((viz.getSpindleTowerMeshByColor('GREEN') as THREE.Group).position.x).toBeCloseTo(
      SPINDLE_TOWERS.GREEN.x,
      5,
    );
  });

  it('slides the Pallet and its stack along -X while LEAVING, the other Pallets stay', async () => {
    const { viz, report } = await mount();
    report('LEAVING');
    now += PALLET_LEAVE_MS / 2;
    report('LEAVING');

    const green = viz.getSpindleTowerMeshByColor('GREEN') as THREE.Group;
    const moved = SPINDLE_TOWERS.GREEN.x - green.position.x;
    expect(moved).toBeGreaterThan(0.1);
    expect(moved).toBeLessThan(PALLET_LANE_TRAVEL_M);
    expect((viz.getSpindleTowerMeshByColor('WHITE') as THREE.Group).position.x).toBeCloseTo(
      SPINDLE_TOWERS.WHITE.x,
      5,
    );
    const stack = gearMeshes(viz);
    expect(stack).toHaveLength(2);
    for (const g of stack) expect(SPINDLE_TOWERS.GREEN.x - g.position.x).toBeCloseTo(moved, 5);
  });

  it('is off-scene and unloaded AWAY, then comes back empty and home', async () => {
    const { viz, report } = await mount();
    report('LEAVING');
    now += 100;
    report('AWAY');

    const green = viz.getSpindleTowerMeshByColor('GREEN') as THREE.Group;
    expect(SPINDLE_TOWERS.GREEN.x - green.position.x).toBeCloseTo(PALLET_LANE_TRAVEL_M, 5);
    expect(gearMeshes(viz).every((g) => g.visible === false)).toBe(true);

    report('RETURNING');
    now += 10_000;
    report('RETURNING');
    expect(green.position.x).toBeCloseTo(SPINDLE_TOWERS.GREEN.x, 5);

    report('HOME');
    expect(green.position.x).toBeCloseTo(SPINDLE_TOWERS.GREEN.x, 5);
  });

  it('draws the stack again once the reset snapshot has an empty then refilled Pallet', async () => {
    const { viz, report } = await mount();
    report('AWAY');
    report('HOME');
    expect(gearMeshes(viz).every((g) => g.visible)).toBe(true);
  });
});
