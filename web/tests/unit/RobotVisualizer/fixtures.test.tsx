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

  describe('Unit 5.1: Procedural Fixtures', () => {
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

    it('mounts no WorkcellTable or landing mat (Flow A removed)', async () => {
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
          />,
        );
      });

      await act(async () => {
        await loadedPromise;
      });

      const scene = (window as any).__robot_visualizer.getScene() as THREE.Scene;
      expect(scene.getObjectByName('workcell-table')).toBeUndefined();
      expect(scene.getObjectByName('workcell-landing-mat')).toBeUndefined();
      expect(scene.getObjectByName('workcell-reticle')).toBeUndefined();
    });

    it('mounts dedicated robot pedestal table under robot base with flange and column', async () => {
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
          />,
        );
      });

      await act(async () => {
        await loadedPromise;
      });

      const visualizer = (window as any).__robot_visualizer;
      const pedestal = visualizer.getPedestalMesh();
      expect(pedestal).toBeDefined();
      expect(pedestal.name).toBe('robot-pedestal-table');

      const top = pedestal.getObjectByName('pedestal-top');
      const flange = pedestal.getObjectByName('pedestal-flange');
      const col = pedestal.getObjectByName('pedestal-column');
      const foot = pedestal.getObjectByName('pedestal-foot');

      expect(top).toBeDefined();
      expect(flange).toBeDefined();
      expect(col).toBeDefined();
      expect(foot).toBeDefined();
    });
  });
});
