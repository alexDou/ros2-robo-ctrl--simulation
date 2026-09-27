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


  describe('Unit 6.4: TeleopClient SpindleTower 3D Fixture, KinematicLinkAttachment & Tower Stacking', () => {
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

    it('mounts SpindleTower 3D fixture at (x=0.40, y=-0.30, z=0.0) with base flange and 0.20m spindle pin', async () => {
      let resolveLoaded: () => void;
      const loadedPromise = new Promise<void>((res) => {
        resolveLoaded = res;
      });

      render(
        <RobotVisualizer
          rendererFactory={() => mockRenderer}
          controlsFactory={() => mockControls}
          onRobotLoaded={() => resolveLoaded()}
        />
      );

      await act(async () => {
        await loadedPromise;
      });

      const visualizer = (window as any).__robot_visualizer;
      const towerMesh = visualizer.getSpindleTowerMesh();
      expect(towerMesh).toBeDefined();
      expect(towerMesh).not.toBeNull();
      expect(towerMesh.name).toBe('spindle-tower');
      expect(towerMesh.position.x).toBeCloseTo(0.40, 2);
      expect(towerMesh.position.y).toBeCloseTo(-0.30, 2);
      expect(towerMesh.position.z).toBeCloseTo(0.0, 2);

      const baseFlange = visualizer.getSpindleBaseFlangeMesh();
      expect(baseFlange).toBeDefined();
      expect(baseFlange).not.toBeNull();
      expect(baseFlange.name).toBe('spindle-base-flange');

      const pin = visualizer.getSpindlePinMesh();
      expect(pin).toBeDefined();
      expect(pin).not.toBeNull();
      expect(pin.name).toBe('spindle-pin');
      // Verify spindle pin height is 0.20m (parameters.height or geometry parameters)
      const pinGeom = pin.geometry as THREE.CylinderGeometry;
      expect(pinGeom.parameters.height).toBeCloseTo(0.20, 2);
      expect(pinGeom.parameters.radiusTop).toBeCloseTo(0.007, 3);
    });

    it('renders spawned entry as table mesh at entry xyz verbatim', async () => {
      const telemetryBufferRef = snapBuffer([{ id: 'g1', x: 0.5, y: 0.0, z: 0.0 , color: 'WHITE', intact: true }]);

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

      const visualizer = (window as any).__robot_visualizer;
      act(() => {
        stepFrame();
      });

      const gear = visualizer.getGearMesh();
      expect(gear).not.toBeNull();
      expect(gear.position.x).toBeCloseTo(0.5, 2);
      expect(gear.position.y).toBeCloseTo(0.0, 2);
      expect(gear.position.z).toBeCloseTo(0.0, 3);
      expect(visualizer.isGearAttached()).toBe(false);
      expect(visualizer.getTowerGearCount()).toBe(0);
    });

    it('moves entry spawned->in_progress: mesh reparents to tool0 flange ride', async () => {
      const telemetryBufferRef = snapBuffer([{ id: 'g1', x: 0.5, y: 0.0, z: 0.0 , color: 'WHITE', intact: true }]);

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

      const visualizer = (window as any).__robot_visualizer;
      act(() => {
        stepFrame();
      });
      const gear = visualizer.getGearMesh();
      expect(gear).not.toBeNull();
      expect(visualizer.isGearAttached()).toBe(false);

      // Backend marks grasped: entry relocates with origin preserved.
      act(() => {
        telemetryBufferRef.current.workcellState.spawned = [];
        telemetryBufferRef.current.workcellState.inProgress = [
          { id: 'g1', x: 0.5, y: 0.0, z: 0.0, origin_x: 0.5, origin_y: 0.0, origin_z: 0.0 , color: 'WHITE', intact: true },
        ];
        stepFrame();
      });

      expect(visualizer.isGearAttached()).toBe(true);
      expect(gear.parent).toBe(fakeTool0Link);
      expect(visualizer.getTowerGearCount()).toBe(0);
      expect(visualizer.getSnapshotGearCount()).toBe(1);
    });

    it('renders processed entries as tower meshes at entry xyz verbatim in order', async () => {
      const telemetryBufferRef = snapBuffer([], [], [
        { id: 'g1', x: 0.4, y: -0.3, z: 0.0, origin_x: 0.5, origin_y: 0.0, origin_z: 0.0 , color: 'WHITE', intact: true },
        { id: 'g2', x: 0.4, y: -0.3, z: 0.02, origin_x: 0.55, origin_y: 0.0, origin_z: 0.0 , color: 'WHITE', intact: true },
        { id: 'g3', x: 0.4, y: -0.3, z: 0.04, origin_x: 0.6, origin_y: 0.0, origin_z: 0.0 , color: 'WHITE', intact: true },
      ]);

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

      const visualizer = (window as any).__robot_visualizer;
      act(() => {
        stepFrame();
      });

      expect(visualizer.getTowerGearCount()).toBe(3);
      const towerGears = visualizer.getTowerGears();
      expect(towerGears[0].position.z).toBeCloseTo(0.0, 3);
      expect(towerGears[1].position.z).toBeCloseTo(0.02, 3);
      expect(towerGears[2].position.z).toBeCloseTo(0.04, 3);
      for (const g of towerGears) {
        expect(g.position.x).toBeCloseTo(0.4, 2);
        expect(g.position.y).toBeCloseTo(-0.3, 2);
      }
      // Processed tower never drives ClickLockout.
      expect(visualizer.isLockedOut()).toBe(false);
      expect(visualizer.hasActiveGear()).toBe(false);
    });

    it('renders backend tower verbatim with no UI cap (overflow owned by workcell)', async () => {
      const processed = Array.from({ length: 11 }, (_, k) => ({
        id: `g${k}`,
        x: 0.4,
        y: -0.3,
        z: k * 0.02,
      }));
      const telemetryBufferRef = snapBuffer([], [], processed);

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

      const visualizer = (window as any).__robot_visualizer;
      act(() => {
        stepFrame();
      });

      expect(visualizer.getTowerGearCount()).toBe(11);
      expect(visualizer.getTowerGears()[10].position.z).toBeCloseTo(0.2, 3);
    });

    it('empty snapshot echo removes all meshes (clear)', async () => {
      const telemetryBufferRef = snapBuffer(
        [{ id: 'g-table', x: 0.5, y: 0.0, z: 0.0 , color: 'WHITE', intact: true }],
        [],
        [{ id: 'g-tower', x: 0.4, y: -0.3, z: 0.0 , color: 'WHITE', intact: true }]
      );

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

      const visualizer = (window as any).__robot_visualizer;
      act(() => {
        stepFrame();
      });
      expect(visualizer.getSnapshotGearCount()).toBe(2);

      act(() => {
        telemetryBufferRef.current.workcellState.spawned = [];
        telemetryBufferRef.current.workcellState.processed = [];
        stepFrame();
      });

      expect(visualizer.getSnapshotGearCount()).toBe(0);
      expect(visualizer.getTowerGearCount()).toBe(0);
      expect(visualizer.getGearMesh()).toBeNull();
      expect(visualizer.isLockedOut()).toBe(false);
    });

    it('grasp-bit and phase hints without snapshot entries create no meshes', async () => {
      const telemetryBufferRef = snapBuffer();
      (telemetryBufferRef.current as any).phase = 'RELEASING';

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

      const visualizer = (window as any).__robot_visualizer;
      telemetryBufferRef.current.palmState.is_grasped = true;
      for (let i = 0; i < 5; i++) {
        act(() => {
          stepFrame();
        });
      }
      telemetryBufferRef.current.palmState.is_grasped = false;
      for (let i = 0; i < 3; i++) {
        act(() => {
          stepFrame();
        });
      }

      expect(visualizer.getSnapshotGearCount()).toBe(0);
      expect(visualizer.getTowerGearCount()).toBe(0);
      expect(visualizer.isGearAttached()).toBe(false);
    });

  });
});
