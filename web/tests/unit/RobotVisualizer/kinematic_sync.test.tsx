import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/preact';
import * as THREE from 'three';
import { RobotVisualizer } from '@components/RobotVisualizer';
import * as robotLoader from '@utils/robotLoader';
describe('Unit 3.2: RobotVisualizer Component', () => {
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

    // ResizeObserver mock
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const stepFrame = () => {
    const cbs = [...rafCallbacks];
    rafCallbacks.length = 0;
    cbs.forEach((cb) => cb(performance.now()));
  };


  describe('Unit 3.3: 60 FPS Telemetry Kinematic Synchronization & Dirty-Checking', () => {
    it('synchronizes all 6 canonical revolute joints by exact name using URDFRobot.setJointValue', async () => {
      const fakeRobot = new THREE.Group() as any;
      fakeRobot.isURDFRobot = true;
      fakeRobot.joints = {};
      fakeRobot.setJointValue = vi.fn();

      vi.spyOn(robotLoader, 'loadRobotModel').mockResolvedValue(fakeRobot);

      const jointPositionsRef = {
        current: [0.1, -0.2, 0.3, -0.4, 0.5, -0.6] as const,
      };

      let robotLoadedResolve: () => void;
      const robotLoadedPromise = new Promise<void>((resolve) => {
        robotLoadedResolve = resolve;
      });

      await act(async () => {
        render(
          <RobotVisualizer
            jointPositionsRef={jointPositionsRef}
            rendererFactory={() => mockRenderer}
            controlsFactory={() => mockControls}
            onRobotLoaded={() => {
              robotLoadedResolve();
            }}
          />
        );
      });

      await act(async () => {
        await robotLoadedPromise;
      });

      // Step animation frame
      act(() => {
        stepFrame();
      });

      // Expect setJointValue was called for all 6 canonical joints
      expect(fakeRobot.setJointValue).toHaveBeenCalledWith('shoulder_pan_joint', 0.1);
      expect(fakeRobot.setJointValue).toHaveBeenCalledWith('shoulder_lift_joint', -0.2);
      expect(fakeRobot.setJointValue).toHaveBeenCalledWith('elbow_joint', 0.3);
      expect(fakeRobot.setJointValue).toHaveBeenCalledWith('wrist_1_joint', -0.4);
      expect(fakeRobot.setJointValue).toHaveBeenCalledWith('wrist_2_joint', 0.5);
      expect(fakeRobot.setJointValue).toHaveBeenCalledWith('wrist_3_joint', -0.6);
    });

    it('initializes loadedRobot at CANONICAL_POSES.HOME joint angles instead of 0 rad flat pose on URDF load', async () => {
      const fakeRobot = new THREE.Group() as any;
      fakeRobot.isURDFRobot = true;
      fakeRobot.joints = {};
      fakeRobot.setJointValue = vi.fn();

      vi.spyOn(robotLoader, 'loadRobotModel').mockResolvedValue(fakeRobot);

      let robotLoadedResolve: () => void;
      const robotLoadedPromise = new Promise<void>((resolve) => {
        robotLoadedResolve = resolve;
      });

      await act(async () => {
        render(
          <RobotVisualizer
            rendererFactory={() => mockRenderer}
            controlsFactory={() => mockControls}
            onRobotLoaded={() => {
              robotLoadedResolve();
            }}
          />
        );
      });

      await act(async () => {
        await robotLoadedPromise;
      });

      expect(fakeRobot.setJointValue).toHaveBeenCalledWith('shoulder_pan_joint', 0.0);
      expect(fakeRobot.setJointValue).toHaveBeenCalledWith('shoulder_lift_joint', -1.5708);
      expect(fakeRobot.setJointValue).toHaveBeenCalledWith('elbow_joint', 0.0);
      expect(fakeRobot.setJointValue).toHaveBeenCalledWith('wrist_1_joint', -1.5708);
      expect(fakeRobot.setJointValue).toHaveBeenCalledWith('wrist_2_joint', 0.0);
      expect(fakeRobot.setJointValue).toHaveBeenCalledWith('wrist_3_joint', 0.0);
    });

    it('skips WebGL draw calls when joint angles and camera position remain unchanged', async () => {
      const fakeRobot = new THREE.Group() as any;
      fakeRobot.isURDFRobot = true;
      fakeRobot.joints = {};
      fakeRobot.setJointValue = vi.fn();

      vi.spyOn(robotLoader, 'loadRobotModel').mockResolvedValue(fakeRobot);

      const jointPositionsRef = {
        current: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0] as number[],
      };

      let robotLoadedResolve: () => void;
      const robotLoadedPromise = new Promise<void>((resolve) => {
        robotLoadedResolve = resolve;
      });

      await act(async () => {
        render(
          <RobotVisualizer
            jointPositionsRef={jointPositionsRef}
            rendererFactory={() => mockRenderer}
            controlsFactory={() => mockControls}
            onRobotLoaded={() => {
              robotLoadedResolve();
            }}
          />
        );
      });

      await act(async () => {
        await robotLoadedPromise;
      });

      mockRenderer.render.mockClear();

      // Frame 1: initial render tick
      act(() => {
        stepFrame();
      });
      expect(mockRenderer.render).toHaveBeenCalledTimes(1);

      // Frame 2: identical joint positions, camera stationary => render SKIPPED
      act(() => {
        stepFrame();
      });
      expect(mockRenderer.render).toHaveBeenCalledTimes(1);

      // Frame 3: joint position updated => WebGL draw call executed
      // (6.7.6 lerp: first step eases 0 -> 0.0625, not a jump to 0.25)
      jointPositionsRef.current = [0.25, 0.0, 0.0, 0.0, 0.0, 0.0];
      act(() => {
        stepFrame();
      });
      expect(mockRenderer.render).toHaveBeenCalledTimes(2);

      // Frame 4: target unchanged but interpolation still converging
      // => render EXECUTED (arm still easing toward 0.25)
      act(() => {
        stepFrame();
      });
      expect(mockRenderer.render).toHaveBeenCalledTimes(3);

      // Settle: step until lerp snaps to target, then renders stop.
      for (let i = 0; i < 60; i++) {
        act(() => {
          stepFrame();
        });
      }
      const settledCount = mockRenderer.render.mock.calls.length;
      act(() => {
        stepFrame();
      });
      expect(mockRenderer.render).toHaveBeenCalledTimes(settledCount);

      // Frame 5: camera movement via controls.update() returning true => draw call executed
      mockControls.update.mockReturnValue(true);
      act(() => {
        stepFrame();
      });
      expect(mockRenderer.render).toHaveBeenCalledTimes(settledCount + 1);

      // Reset controls movement
      mockControls.update.mockReturnValue(false);
      act(() => {
        stepFrame();
      });
      expect(mockRenderer.render).toHaveBeenCalledTimes(settledCount + 1);
    });

    it('updates link world transformation matrices accurately in response to dynamic ArmJointPositions', async () => {
      const fakeRobot = new THREE.Group() as any;
      fakeRobot.isURDFRobot = true;
      fakeRobot.joints = {};
      fakeRobot.links = {};

      const shoulderJoint = new THREE.Group() as any;
      shoulderJoint.name = 'shoulder_pan_joint';
      shoulderJoint.isURDFJoint = true;
      shoulderJoint.axis = new THREE.Vector3(0, 0, 1);
      shoulderJoint.angle = 0;
      shoulderJoint.setJointValue = vi.fn((angle: number) => {
        shoulderJoint.angle = angle;
        shoulderJoint.quaternion.setFromAxisAngle(shoulderJoint.axis, angle);
        shoulderJoint.matrixWorldNeedsUpdate = true;
        return true;
      });

      const shoulderLink = new THREE.Object3D();
      shoulderLink.name = 'shoulder_link';
      shoulderLink.position.set(1, 0, 0); // 1m offset along X

      shoulderJoint.add(shoulderLink);
      fakeRobot.add(shoulderJoint);
      fakeRobot.joints['shoulder_pan_joint'] = shoulderJoint;
      fakeRobot.links['shoulder_link'] = shoulderLink;

      fakeRobot.setJointValue = vi.fn((name: string, ...values: number[]) => {
        if (fakeRobot.joints[name]) {
          return fakeRobot.joints[name].setJointValue(...values);
        }
        return false;
      });

      vi.spyOn(robotLoader, 'loadRobotModel').mockResolvedValue(fakeRobot);

      const jointPositionsRef = {
        current: [0, 0, 0, 0, 0, 0] as number[],
      };

      let robotLoadedResolve: () => void;
      const robotLoadedPromise = new Promise<void>((resolve) => {
        robotLoadedResolve = resolve;
      });

      await act(async () => {
        render(
          <RobotVisualizer
            jointPositionsRef={jointPositionsRef}
            rendererFactory={() => mockRenderer}
            controlsFactory={() => mockControls}
            onRobotLoaded={() => {
              robotLoadedResolve();
            }}
          />
        );
      });

      await act(async () => {
        await robotLoadedPromise;
      });

      act(() => {
        stepFrame();
      });

      const initialWorldMatrix = shoulderLink.matrixWorld.clone();

      // Rotate shoulder by 90 degrees (Math.PI / 2)
      // (6.7.6 lerp: converges over frames, not a single jump)
      jointPositionsRef.current = [Math.PI / 2, 0, 0, 0, 0, 0];
      act(() => {
        stepFrame();
      });

      // World matrix of shoulder_link has updated (partial ease toward target)
      const firstCalls = fakeRobot.setJointValue.mock.calls.filter(
        (c: any[]) => c[0] === 'shoulder_pan_joint'
      );
      const firstVal = firstCalls[firstCalls.length - 1][1] as number;
      expect(firstVal).toBeGreaterThan(0);
      expect(firstVal).toBeLessThan(Math.PI / 2);
      expect(shoulderLink.matrixWorld.equals(initialWorldMatrix)).toBe(false);

      // Settle to exact target over subsequent frames.
      for (let i = 0; i < 60; i++) {
        act(() => {
          stepFrame();
        });
      }
      expect(fakeRobot.setJointValue).toHaveBeenCalledWith('shoulder_pan_joint', Math.PI / 2);

      // Verify rotation in world matrix: (1, 0, 0) rotated by 90 deg around Z becomes (0, 1, 0)
      const worldPos = new THREE.Vector3();
      worldPos.setFromMatrixPosition(shoulderLink.matrixWorld);
      expect(worldPos.x).toBeCloseTo(0, 4);
      expect(worldPos.y).toBeCloseTo(1, 4);
    });

    it('synchronously consumes incoming telemetry from telemetryBufferRef without VDOM re-rendering', async () => {
      const fakeRobot = new THREE.Group() as any;
      fakeRobot.isURDFRobot = true;
      fakeRobot.joints = {};
      fakeRobot.setJointValue = vi.fn();

      vi.spyOn(robotLoader, 'loadRobotModel').mockResolvedValue(fakeRobot);

      const telemetryBufferRef = {
        current: {
          jointPositions: [0.5, -0.5, 0.5, -0.5, 0.5, -0.5] as readonly number[],
        },
      };

      let robotLoadedResolve: () => void;
      const robotLoadedPromise = new Promise<void>((resolve) => {
        robotLoadedResolve = resolve;
      });

      await act(async () => {
        render(
          <RobotVisualizer
            telemetryBufferRef={telemetryBufferRef}
            rendererFactory={() => mockRenderer}
            controlsFactory={() => mockControls}
            onRobotLoaded={() => {
              robotLoadedResolve();
            }}
          />
        );
      });

      await act(async () => {
        await robotLoadedPromise;
      });

      act(() => {
        stepFrame();
      });

      expect(fakeRobot.setJointValue).toHaveBeenCalledWith('shoulder_pan_joint', 0.5);
      expect(fakeRobot.setJointValue).toHaveBeenCalledWith('shoulder_lift_joint', -0.5);
      expect(fakeRobot.setJointValue).toHaveBeenCalledWith('elbow_joint', 0.5);
    });

    it('safely ignores non-finite (NaN, Infinity) values in joint telemetry without triggering render loops', async () => {
      const fakeRobot = new THREE.Group() as any;
      fakeRobot.isURDFRobot = true;
      fakeRobot.joints = {};
      fakeRobot.setJointValue = vi.fn();

      vi.spyOn(robotLoader, 'loadRobotModel').mockResolvedValue(fakeRobot);

      const jointPositionsRef = {
        current: [NaN, Infinity, -Infinity, 0.0, 0.0, 0.0] as number[],
      };

      let robotLoadedResolve: () => void;
      const robotLoadedPromise = new Promise<void>((resolve) => {
        robotLoadedResolve = resolve;
      });

      await act(async () => {
        render(
          <RobotVisualizer
            jointPositionsRef={jointPositionsRef}
            rendererFactory={() => mockRenderer}
            controlsFactory={() => mockControls}
            onRobotLoaded={() => {
              robotLoadedResolve();
            }}
          />
        );
      });

      await act(async () => {
        await robotLoadedPromise;
      });

      mockRenderer.render.mockClear();

      // Initial step: only finite joints (indices 3, 4, 5) get set
      act(() => {
        stepFrame();
      });

      expect(fakeRobot.setJointValue).not.toHaveBeenCalledWith('shoulder_pan_joint', expect.anything());
      expect(fakeRobot.setJointValue).not.toHaveBeenCalledWith('shoulder_lift_joint', expect.anything());
      expect(fakeRobot.setJointValue).not.toHaveBeenCalledWith('elbow_joint', expect.anything());

      expect(mockRenderer.render).toHaveBeenCalledTimes(1);

      // Subsequent step with same NaN/Infinity array does NOT trigger repeated render calls
      act(() => {
        stepFrame();
      });
      expect(mockRenderer.render).toHaveBeenCalledTimes(1);
    });

  });
});
