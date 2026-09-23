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


  describe('Unit 4.1: Dexterous Palm 3D Model & Kinematic Flange Mounting', () => {
    let fakeTool0Link: THREE.Object3D;
    let fakeRobot: any;

    beforeEach(() => {
      fakeTool0Link = new THREE.Object3D();
      fakeTool0Link.name = 'tool0';

      fakeRobot = new THREE.Group();
      fakeRobot.name = 'ur5e-mock';
      fakeRobot.links = {
        tool0: fakeTool0Link,
      };
      fakeRobot.joints = {};
      fakeRobot.setJointValue = vi.fn();
      fakeRobot.add(fakeTool0Link);

      vi.spyOn(robotLoader, 'loadRobotModel').mockResolvedValue(fakeRobot as any);
    });

    it('mounts procedural dexterous palm geometries to link tool0 upon robot loading', async () => {
      let resolveLoaded: () => void;
      const loadedPromise = new Promise<void>((res) => {
        resolveLoaded = res;
      });

      await act(async () => {
        render(
          <RobotVisualizer
            rendererFactory={() => mockRenderer}
            controlsFactory={() => mockControls}
            onRobotLoaded={() => resolveLoaded()}
          />
        );
      });

      await act(async () => {
        await loadedPromise;
      });

      const palmGroup = fakeTool0Link.children.find((child) => child.name === 'dexterous-palm');
      expect(palmGroup).toBeDefined();

      const childrenNames = palmGroup!.children.map((c) => c.name);
      expect(childrenNames).toContain('palm-baseplate');
      expect(childrenNames).toContain('palm-extension-rod');
      expect(childrenNames).toContain('palm-suction-nozzle');
    });

    it('toggles nozzle emissive highlight on palm_state.is_grasped changes in telemetryBufferRef', async () => {
      const telemetryBufferRef = {
        current: {
          jointPositions: [0, 0, 0, 0, 0, 0],
          palmState: { is_grasped: false },
        },
      };

      let resolveLoaded: () => void;
      const loadedPromise = new Promise<void>((res) => {
        resolveLoaded = res;
      });

      await act(async () => {
        render(
          <RobotVisualizer
            rendererFactory={() => mockRenderer}
            controlsFactory={() => mockControls}
            telemetryBufferRef={telemetryBufferRef}
            onRobotLoaded={() => resolveLoaded()}
          />
        );
      });

      await act(async () => {
        await loadedPromise;
      });

      const palmGroup = fakeTool0Link.children.find((child) => child.name === 'dexterous-palm')!;
      expect(palmGroup).toBeDefined();
      const nozzle = palmGroup.children.find((c) => c.name === 'palm-suction-nozzle') as THREE.Mesh;
      expect(nozzle).toBeDefined();
      const nozzleMat = nozzle.material as THREE.MeshStandardMaterial;

      // Initially idle (not grasped)
      expect(nozzleMat.emissive.getHex()).toBe(0x000000);

      // Mutate telemetry buffer to grasped = true
      telemetryBufferRef.current.palmState.is_grasped = true;
      act(() => {
        stepFrame();
      });

      // Nozzle material should glow
      expect(nozzleMat.emissive.getHex()).not.toBe(0x000000);
      expect(nozzleMat.emissiveIntensity).toBeGreaterThan(0);

      // Mutate telemetry buffer back to grasped = false
      telemetryBufferRef.current.palmState.is_grasped = false;
      act(() => {
        stepFrame();
      });

      // Nozzle material should return to idle
      expect(nozzleMat.emissive.getHex()).toBe(0x000000);
    });

    it('cleans up and disposes palm geometries and materials on unmount', async () => {
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

      const palmGroup = fakeTool0Link.children.find((child) => child.name === 'dexterous-palm')!;
      expect(palmGroup).toBeDefined();

      const nozzle = palmGroup.children.find((c) => c.name === 'palm-suction-nozzle') as THREE.Mesh;
      const geomDisposeSpy = vi.spyOn(nozzle.geometry, 'dispose');
      const matDisposeSpy = vi.spyOn(nozzle.material as THREE.Material, 'dispose');

      act(() => {
        unmountFn();
      });

      expect(geomDisposeSpy).toHaveBeenCalled();
      expect(matDisposeSpy).toHaveBeenCalled();
    });
  });
});
