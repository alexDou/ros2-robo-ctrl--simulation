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


  describe('Unit 5.1: 3D Workcell Table, Raycaster & Procedural Gear Ingestion', () => {
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

    it('pointer raycaster calculates Cartesian coordinates and shows reticle within reachability boundary (0.40m <= R <= 0.75m)', async () => {
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

      const visualizer = (window as any).__robot_visualizer;
      const reticle = visualizer.getReticleMesh();
      expect(reticle).toBeDefined();
      expect(reticle.name).toBe('workcell-reticle');
      expect(reticle.visible).toBe(false);

      // Hover reachable table position: x=0.5, y=0.0 (R=0.5m)
      act(() => {
        visualizer.simulatePointerMove(0.5, 0.0);
      });

      expect(reticle.visible).toBe(true);
      expect(reticle.position.x).toBeCloseTo(0.5, 2);
      expect(reticle.position.y).toBeCloseTo(0.0, 2);
      expect(reticle.position.z).toBeCloseTo(0.006, 3);
      expect(reticle.renderOrder).toBe(999);

      // Reticle material has visible light accent shade and depthTest disabled for overlay
      const reticleMat = reticle.material as THREE.MeshBasicMaterial;
      expect(reticleMat.color).toBeDefined();
      expect(reticleMat.depthTest).toBe(false);
    });

    it('reticle automatically hides when outside reachability boundary (R < 0.40m or R > 0.75m)', async () => {
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

      const visualizer = (window as any).__robot_visualizer;
      const reticle = visualizer.getReticleMesh();

      // 1. Hover reachable spot: x=0.50, y=0.0 (R=0.50m >= 0.40m)
      act(() => {
        visualizer.simulatePointerMove(0.5, 0.0);
      });
      expect(reticle.visible).toBe(true);

      // 2. Hover inner unreachable deadzone: x=0.25, y=0.0 (R=0.25m < 0.40m)
      act(() => {
        visualizer.simulatePointerMove(0.25, 0.0);
      });
      expect(reticle.visible).toBe(false);

      // 3. Hover newly shifted inner deadzone: x=0.38, y=0.0 (R=0.38m < 0.40m)
      act(() => {
        visualizer.simulatePointerMove(0.38, 0.0);
      });
      expect(reticle.visible).toBe(false);

      // 4. Hover outer unreachable boundary: x=0.85, y=0.0 (R=0.85m > 0.75m)
      act(() => {
        visualizer.simulatePointerMove(0.85, 0.0);
      });
      expect(reticle.visible).toBe(false);

      // 5. Pointer leaves table
      act(() => {
        visualizer.simulatePointerLeave();
      });
      expect(reticle.visible).toBe(false);

      // 6. Reachable distance R ~ 0.64m, but y=0.4m is outside table bounds (slabDepth/2 = 0.3m)
      act(() => {
        visualizer.simulatePointerMove(0.5, 0.4);
      });
      expect(reticle.visible).toBe(false);
    });

    it('reticle automatically hides when robot_state is not IDLE or when locked out', async () => {
      let resolveLoaded: () => void;
      const loadedPromise = new Promise<void>((res) => {
        resolveLoaded = res;
      });

      const { rerender } = render(
        <RobotVisualizer
          robotState="EXECUTING"
          rendererFactory={() => mockRenderer}
          controlsFactory={() => mockControls}
          onRobotLoaded={() => resolveLoaded()}
        />
      );

      await act(async () => {
        await loadedPromise;
      });

      const visualizer = (window as any).__robot_visualizer;
      const reticle = visualizer.getReticleMesh();

      // In EXECUTING state, hovering reachable spot hides reticle
      act(() => {
        visualizer.simulatePointerMove(0.5, 0.0);
      });
      expect(reticle.visible).toBe(false);

      // Re-render in IDLE state
      rerender(
        <RobotVisualizer
          robotState="IDLE"
          rendererFactory={() => mockRenderer}
          controlsFactory={() => mockControls}
        />
      );

      act(() => {
        visualizer.simulatePointerMove(0.5, 0.0);
      });
      expect(reticle.visible).toBe(true);
    });

    it('clicking reachable spot sends SPAWN_OBJECT with no local mesh before echo', async () => {
      const onSpawnSpy = vi.fn();
      let resolveLoaded: () => void;
      const loadedPromise = new Promise<void>((res) => {
        resolveLoaded = res;
      });

      await act(async () => {
        render(
          <RobotVisualizer
            onSpawnObject={onSpawnSpy}
            rendererFactory={() => mockRenderer}
            controlsFactory={() => mockControls}
            onRobotLoaded={() => resolveLoaded()}
          />
        );
      });

      await act(async () => {
        await loadedPromise;
      });

      const visualizer = (window as any).__robot_visualizer;

      // Click reachable table spot: x=0.5, y=0.1 (R ~ 0.51m)
      act(() => {
        visualizer.simulateClick(0.5, 0.1);
      });

      expect(onSpawnSpy).toHaveBeenCalledTimes(1);
      expect(onSpawnSpy).toHaveBeenCalledWith({
        x: 0.5,
        y: 0.1,
        z: 0.0,
        object_type: 'GEAR',
      });

      // Workcell-authority: no local mesh before snapshot echo, no lockout.
      expect(visualizer.getSnapshotGearCount()).toBe(0);
      expect(visualizer.getGearMesh()).toBeNull();
      expect(visualizer.hasActiveGear()).toBe(false);
      expect(visualizer.isLockedOut()).toBe(false);
    });

    it('snapshot echo renders spawned mesh verbatim and drives ClickLockout', async () => {
      const onSpawnSpy = vi.fn();
      const telemetryBufferRef = snapBuffer();
      let resolveLoaded: () => void;
      const loadedPromise = new Promise<void>((res) => {
        resolveLoaded = res;
      });

      await act(async () => {
        render(
          <RobotVisualizer
            telemetryBufferRef={telemetryBufferRef}
            onSpawnObject={onSpawnSpy}
            rendererFactory={() => mockRenderer}
            controlsFactory={() => mockControls}
            onRobotLoaded={() => resolveLoaded()}
          />
        );
      });

      await act(async () => {
        await loadedPromise;
      });

      const visualizer = (window as any).__robot_visualizer;

      // Backend echo: spawned entry appears at click coords verbatim.
      act(() => {
        telemetryBufferRef.current.workcellState.spawned = [{ id: 'g1', x: 0.5, y: 0.1, z: 0.0 , color: 'WHITE', intact: true }];
        stepFrame();
      });

      expect(visualizer.getSnapshotGearCount()).toBe(1);
      const pos = visualizer.getSnapshotGearPosition('g1');
      expect(pos.x).toBeCloseTo(0.5, 2);
      expect(pos.y).toBeCloseTo(0.1, 2);
      expect(pos.z).toBeCloseTo(0.0, 3);
      expect(visualizer.hasActiveGear()).toBe(true);
      expect(visualizer.isLockedOut()).toBe(true);

      // Click blocked while snapshot holds an active entry.
      act(() => {
        visualizer.simulateClick(0.6, 0.0);
      });
      expect(onSpawnSpy).not.toHaveBeenCalled();

      // Reticle hidden while locked out.
      act(() => {
        visualizer.simulatePointerMove(0.6, 0.0);
      });
      expect(visualizer.getReticleMesh().visible).toBe(false);
    });

    it('snapshot removal deletes mesh and lifts ClickLockout; clearWorkspace is echo-driven no-op', async () => {
      const onSpawnSpy = vi.fn();
      const telemetryBufferRef = snapBuffer([{ id: 'g1', x: 0.5, y: 0.0, z: 0.0 , color: 'WHITE', intact: true }]);
      let resolveLoaded: () => void;
      const loadedPromise = new Promise<void>((res) => {
        resolveLoaded = res;
      });

      render(
        <RobotVisualizer
          telemetryBufferRef={telemetryBufferRef}
          onSpawnObject={onSpawnSpy}
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
      expect(visualizer.getSnapshotGearCount()).toBe(1);
      expect(visualizer.isLockedOut()).toBe(true);

      // clearWorkspace is a local no-op: mesh persists until snapshot echo.
      act(() => {
        visualizer.clearWorkspace();
      });
      expect(visualizer.getSnapshotGearCount()).toBe(1);

      // Empty echo removes the mesh and lifts lockout.
      act(() => {
        telemetryBufferRef.current.workcellState.spawned = [];
        stepFrame();
      });
      expect(visualizer.getSnapshotGearCount()).toBe(0);
      expect(visualizer.getGearMesh()).toBeNull();
      expect(visualizer.hasActiveGear()).toBe(false);
      expect(visualizer.isLockedOut()).toBe(false);

      // Clickable again after echo.
      act(() => {
        visualizer.simulateClick(0.55, 0.0);
      });
      expect(onSpawnSpy).toHaveBeenCalledTimes(1);
    });

    it('cleans up and disposes table, reticle, and snapshot gear geometries and materials on unmount', async () => {
      const telemetryBufferRef = snapBuffer([{ id: 'g1', x: 0.5, y: 0.0, z: 0.0 , color: 'WHITE', intact: true }]);
      let unmountFn: () => void;
      let resolveLoaded: () => void;
      const loadedPromise = new Promise<void>((res) => {
        resolveLoaded = res;
      });

      await act(async () => {
        const res = render(
          <RobotVisualizer
            telemetryBufferRef={telemetryBufferRef}
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
      act(() => {
        stepFrame();
      });
      const table = visualizer.getTableMesh();
      const reticle = visualizer.getReticleMesh();
      const gear = visualizer.getGearMesh();
      expect(gear).not.toBeNull();
      const gearBody = gear.children.find((c: any) => c.name === 'gear-body');

      const tableGeomSpy = vi.spyOn(table.geometry, 'dispose');
      const tableMatSpy = vi.spyOn(table.material as THREE.Material, 'dispose');
      const reticleGeomSpy = vi.spyOn(reticle.geometry, 'dispose');
      const reticleMatSpy = vi.spyOn(reticle.material as THREE.Material, 'dispose');
      const gearGeomSpy = vi.spyOn(gearBody.geometry, 'dispose');
      const gearMatSpy = vi.spyOn(gearBody.material as THREE.Material, 'dispose');

      act(() => {
        unmountFn();
      });

      expect(tableGeomSpy).toHaveBeenCalled();
      expect(tableMatSpy).toHaveBeenCalled();
      expect(reticleGeomSpy).toHaveBeenCalled();
      expect(reticleMatSpy).toHaveBeenCalled();
      expect(gearGeomSpy).toHaveBeenCalled();
      expect(gearMatSpy).toHaveBeenCalled();
    });

    it('clicking outside table lateral edges does not spawn gear', async () => {
      const onSpawnSpy = vi.fn();
      let resolveLoaded: () => void;
      const loadedPromise = new Promise<void>((res) => {
        resolveLoaded = res;
      });

      await act(async () => {
        render(
          <RobotVisualizer
            onSpawnObject={onSpawnSpy}
            rendererFactory={() => mockRenderer}
            controlsFactory={() => mockControls}
            onRobotLoaded={() => resolveLoaded()}
          />
        );
      });

      await act(async () => {
        await loadedPromise;
      });

      const visualizer = (window as any).__robot_visualizer;

      // Click outside lateral table edge: x=0.5, y=0.4 (R ~ 0.64m but y > 0.3m)
      act(() => {
        const clicked = visualizer.simulateClick(0.5, 0.4);
        expect(clicked).toBe(false);
      });

      expect(visualizer.hasActiveGear()).toBe(false);
      expect(visualizer.isLockedOut()).toBe(false);
      expect(onSpawnSpy).not.toHaveBeenCalled();
    });

    it('filters out canvas drag events (e.g. camera orbit) and does not spawn gear', async () => {
      const onSpawnSpy = vi.fn();
      let resolveLoaded: () => void;
      const loadedPromise = new Promise<void>((res) => {
        resolveLoaded = res;
      });

      const { container } = render(
        <RobotVisualizer
          onSpawnObject={onSpawnSpy}
          rendererFactory={() => mockRenderer}
          controlsFactory={() => mockControls}
          onRobotLoaded={() => resolveLoaded()}
        />
      );

      await act(async () => {
        await loadedPromise;
      });

      const canvas = container.querySelector('canvas')!;
      const visualizer = (window as any).__robot_visualizer;

      // Simulate pointerdown at (100, 100) and click at (150, 150) (distance > 4px drag)
      act(() => {
        const downEvt =
          typeof PointerEvent !== 'undefined'
            ? new PointerEvent('pointerdown', { clientX: 100, clientY: 100, bubbles: true })
            : new MouseEvent('pointerdown', { clientX: 100, clientY: 100, bubbles: true });
        canvas.dispatchEvent(downEvt);
        canvas.dispatchEvent(new MouseEvent('click', { clientX: 150, clientY: 150, bubbles: true }));
      });

      expect(visualizer.hasActiveGear()).toBe(false);
      expect(visualizer.isLockedOut()).toBe(false);
      expect(onSpawnSpy).not.toHaveBeenCalled();
    });
  });
});
