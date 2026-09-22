import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/preact';
import * as THREE from 'three';
import { RobotVisualizer } from '@components/RobotVisualizer';
import * as robotLoader from '@utils/robotLoader';

describe('Unit 6.7.6: joint interpolation (sparse telemetry -> smooth 60fps)', () => {
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
      setSize: vi.fn(), setPixelRatio: vi.fn(), render: vi.fn(),
      dispose: vi.fn(), forceContextLoss: vi.fn(),
    };
    mockControls = {
      target: new THREE.Vector3(0, 0, 0),
      minDistance: 0, maxDistance: Infinity,
      maxPolarAngle: Math.PI, minPolarAngle: 0,
      enableDamping: false, update: vi.fn().mockReturnValue(false),
      dispose: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(),
    };
    globalThis.ResizeObserver = class {
      observe() {} unobserve() {} disconnect() {}
    } as any;
  });

  afterEach(() => { vi.restoreAllMocks(); });

  const stepFrame = () => {
    const cbs = [...rafCallbacks];
    rafCallbacks.length = 0;
    cbs.forEach((cb) => cb(performance.now()));
  };

  it('eases toward a new target instead of jumping, then converges', async () => {
    const fakeRobot = new THREE.Group() as any;
    fakeRobot.isURDFRobot = true;
    fakeRobot.joints = {};
    fakeRobot.setJointValue = vi.fn();
    vi.spyOn(robotLoader, 'loadRobotModel').mockResolvedValue(fakeRobot);

    const ref = { current: [0, 0, 0, 0, 0, 0] as readonly number[] };
    let resolveLoaded!: () => void;
    const loaded = new Promise<void>((r) => { resolveLoaded = r; });
    await act(async () => {
      render(
        <RobotVisualizer
          jointPositionsRef={ref}
          rendererFactory={() => mockRenderer}
          controlsFactory={() => mockControls}
          onRobotLoaded={() => { resolveLoaded(); }}
        />
      );
    });
    await act(async () => { await loaded; });

    act(() => { stepFrame(); }); // snap to 0
    fakeRobot.setJointValue.mockClear();

    ref.current = [1, 0, 0, 0, 0, 0];
    act(() => { stepFrame(); });
    const firstCalls = fakeRobot.setJointValue.mock.calls.filter((c: any[]) => c[0] === 'shoulder_pan_joint');
    expect(firstCalls.length).toBeGreaterThan(0);
    const v1 = firstCalls[firstCalls.length - 1][1] as number;
    expect(v1).toBeGreaterThan(0);
    expect(v1).toBeLessThan(1);

    for (let i = 0; i < 60; i++) { act(() => { stepFrame(); }); }
    const allCalls = fakeRobot.setJointValue.mock.calls.filter((c: any[]) => c[0] === 'shoulder_pan_joint');
    const vLast = allCalls[allCalls.length - 1][1] as number;
    expect(vLast).toBeCloseTo(1, 3);
  });
});
