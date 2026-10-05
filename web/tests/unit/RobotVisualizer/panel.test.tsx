import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/preact';
import * as THREE from 'three';
import { RobotVisualizer } from '@components/RobotVisualizer';
import * as robotLoader from '@utils/robotLoader';
import { createDisplayPanel, panelLines } from '@components/RobotVisualizer/assets/panel';
import { DISPLAY_PANEL, SCRAP_BIN } from '@contracts';
import { binCount } from '@utils/towerCounts';

const gear = (id: string, color: 'WHITE' | 'GREEN' | 'BLUE', intact = true) => ({
  id,
  x: 0,
  y: 0,
  z: 0,
  color,
  intact,
});

describe('Unit 9.13: display panel', () => {
  it('formats feeder, bin and pallet counts n/10', () => {
    expect(
      panelLines({
        feederRemaining: 42,
        binCount: 3,
        palletCounts: { WHITE: 1, GREEN: 10, BLUE: 0 },
      }),
    ).toEqual(['FEEDER  42', 'BIN  3', 'WHITE  1/10', 'GREEN  10/10', 'BLUE  0/10']);
  });

  it('sits at the schema post position, clear of the ScrapBin path, facing the camera (-Y)', () => {
    const panel = createDisplayPanel();
    expect(panel.group.position.toArray()).toEqual([...DISPLAY_PANEL]);
    expect(DISPLAY_PANEL[1]).toBeGreaterThan(SCRAP_BIN[1] + 0.3); // bin slides at Y = SCRAP_BIN[1]
    const screen = panel.group.getObjectByName('display-panel-screen')!;
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(screen.quaternion);
    expect(normal.y).toBeCloseTo(-1);
    panel.dispose();
  });

  it('counts the bin as Scrapped plus Flow A defectives, never Rejected', () => {
    expect(
      binCount([gear('a', 'BLUE', false)], [gear('b', 'WHITE', false), gear('c', 'WHITE')]),
    ).toBe(2);
    expect(binCount(undefined, undefined)).toBe(0);
  });
});

describe('Unit 9.13: panel values follow the telemetry', () => {
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

  it('shows feeder remaining, bin count and pallet counts from props and WorkcellState', async () => {
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
    const viz = (window as any).__robot_visualizer;
    expect(viz.getDisplayPanelText()).toEqual([
      'FEEDER  37',
      'BIN  2',
      'WHITE  0/10',
      'GREEN  2/10',
      'BLUE  0/10',
    ]);
  });
});
