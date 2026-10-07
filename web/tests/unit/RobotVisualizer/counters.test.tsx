import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, screen } from '@testing-library/preact';
import * as THREE from 'three';
import { RobotVisualizer } from '@components/RobotVisualizer';
import * as robotLoader from '@utils/robotLoader';

const gear = (id: string, color: 'WHITE' | 'GREEN' | 'BLUE', intact = true) => ({
  id,
  x: 0,
  y: 0,
  z: 0,
  color,
  intact,
});

describe('Unit 9.13: counters overlay follows the telemetry', () => {
  let rafCallbacks: ((time: number) => void)[] = [];
  const stepFrame = () => rafCallbacks.splice(0).forEach((cb) => cb(performance.now()));

  beforeEach(() => {
    rafCallbacks = [];
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

  it('shows feeder remaining from props and the bin and pallet counts from cell_state', async () => {
    const buffer = {
      current: {
        jointPositions: [0, 0, 0, 0, 0, 0],
        palmState: { is_grasped: false },
        workcellState: {
          spawned: [],
          inProgress: [],
          processed: [gear('p1', 'GREEN'), gear('p2', 'GREEN')],
          scrapped: [gear('s1', 'BLUE', false), gear('s2', 'WHITE', false)],
          rejected: [gear('r1', 'WHITE', false)],
          activeId: null,
        },
        cellState: {
          conveyor_status: 'HALTED',
          feeder_remaining: 37,
          belt_offset_m: 0,
          belt_gears: [],
          stations: [
            { name: 'WHITE', exchange_state: 'HOME', count: 0 },
            { name: 'GREEN', exchange_state: 'HOME', count: 2 },
            { name: 'BLUE', exchange_state: 'HOME', count: 0 },
            { name: 'SCRAP', exchange_state: 'HOME', count: 2 },
          ],
        },
      },
    };
    let resolveLoaded!: () => void;
    const loaded = new Promise<void>((res) => (resolveLoaded = res));
    render(
      <RobotVisualizer
        telemetryBufferRef={buffer as any}
        hopperCount={37}
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
    act(() => stepFrame());
    const counters = screen.getByTestId('cell-counters');
    expect(Array.from(counters.children, (c) => c.textContent)).toEqual([
      'FEEDER: 37',
      'BIN: 2',
      'WHITE: 0/10',
      'GREEN: 2/10',
      'BLUE: 0/10',
    ]);
    expect(screen.getByTestId('counter-FEEDER').textContent).toBe('FEEDER: 37');
    expect(screen.getByTestId('tower-counter-GREEN').textContent).toBe('GREEN: 2/10');
  });
});
