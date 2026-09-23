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

    it('EXECUTING/IDLE robotState transitions never mutate snapshot meshes', async () => {
      const telemetryBufferRef = snapBuffer([{ id: 'g1', x: 0.5, y: 0.0, z: 0.0 , color: 'WHITE', intact: true }]);

      let resolveLoaded: () => void;
      const loadedPromise = new Promise<void>((res) => {
        resolveLoaded = res;
      });

      const { rerender } = render(
        <RobotVisualizer
          robotState="IDLE"
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
      expect(visualizer.getGearMesh()).not.toBeNull();

      act(() => {
        rerender(
          <RobotVisualizer
            robotState="EXECUTING"
            telemetryBufferRef={telemetryBufferRef}
            rendererFactory={() => mockRenderer}
            controlsFactory={() => mockControls}
          />
        );
      });
      act(() => {
        stepFrame();
      });
      expect(visualizer.getGearMesh()).not.toBeNull();
      expect(visualizer.getTowerGearCount()).toBe(0);

      act(() => {
        rerender(
          <RobotVisualizer
            robotState="IDLE"
            telemetryBufferRef={telemetryBufferRef}
            rendererFactory={() => mockRenderer}
            controlsFactory={() => mockControls}
          />
        );
      });
      act(() => {
        stepFrame();
      });
      expect(visualizer.getGearMesh()).not.toBeNull();
      expect(visualizer.getTowerGearCount()).toBe(0);
    });

    it('disposes SpindleTower geometries and materials on unmount', async () => {
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

      const visualizer = (window as any).__robot_visualizer;
      const baseFlange = visualizer.getSpindleBaseFlangeMesh();
      const pin = visualizer.getSpindlePinMesh();

      const flangeGeomSpy = vi.spyOn(baseFlange.geometry, 'dispose');
      const flangeMatSpy = vi.spyOn(baseFlange.material as THREE.Material, 'dispose');
      const pinGeomSpy = vi.spyOn(pin.geometry, 'dispose');
      const pinMatSpy = vi.spyOn(pin.material as THREE.Material, 'dispose');

      act(() => {
        unmountFn();
      });

      expect(flangeGeomSpy).toHaveBeenCalled();
      expect(flangeMatSpy).toHaveBeenCalled();
      expect(pinGeomSpy).toHaveBeenCalled();
      expect(pinMatSpy).toHaveBeenCalled();
    });

    it('Unit 6.7.5: phase/RELEASING without snapshot entries grows no tower; processed echo deposits verbatim', async () => {
      const telemetryBufferRef = snapBuffer();
      (telemetryBufferRef.current as any).phase = 'GRASPING';

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
      fakeTool0Link.position.set(0, 0.5, 0.5);
      fakeRobot.updateMatrixWorld(true);

      // Grasp-bit + phase hints alone: no mesh without entry.
      telemetryBufferRef.current.palmState.is_grasped = true;
      act(() => {
        stepFrame();
      });
      expect(visualizer.isGearAttached()).toBe(false);

      (telemetryBufferRef.current as any).phase = 'TRANSFERRING';
      telemetryBufferRef.current.palmState.is_grasped = false;
      for (let i = 0; i < 5; i++) {
        act(() => {
          stepFrame();
        });
        expect(visualizer.isGearAttached()).toBe(false);
        expect(visualizer.getTowerGearCount()).toBe(0);
      }

      (telemetryBufferRef.current as any).phase = 'RELEASING';
      for (let i = 0; i < 3; i++) {
        act(() => {
          stepFrame();
        });
      }
      expect(visualizer.isGearAttached()).toBe(false);
      expect(visualizer.getTowerGearCount()).toBe(0);

      // Processed echo deposits tower mesh at entry coords verbatim.
      act(() => {
        telemetryBufferRef.current.workcellState.processed = [
          { id: 'g1', x: 0.4, y: -0.3, z: 0.0, origin_x: 0.5, origin_y: 0.0, origin_z: 0.0 , color: 'WHITE', intact: true },
        ];
        stepFrame();
      });
      expect(visualizer.getTowerGearCount()).toBe(1);
      expect(visualizer.getTowerGears()[0].position.z).toBeCloseTo(0.0, 3);
    });
  });
});
