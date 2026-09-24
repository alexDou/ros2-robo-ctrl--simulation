import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/preact';
import * as THREE from 'three';
import { RobotVisualizer } from '@components/RobotVisualizer';
import * as robotLoader from '@utils/robotLoader';
import { GEAR_CLASSIFIED_HEX } from '@components/RobotVisualizer/assets/gear';
import { SCRAP_BIN } from '@contracts';

function snapBuffer(spawned: any[] = [], inProgress: any[] = [], processed: any[] = []) {
  return {
    current: {
      jointPositions: [0, 0, 0, 0, 0, 0],
      palmState: { is_grasped: false },
      workcellState: { spawned, inProgress, processed, activeId: null },
    },
  };
}

function notchVisible(group: THREE.Group): boolean {
  const notch = group.getObjectByName('gear-crack-notch') as THREE.Mesh | undefined;
  return Boolean(notch?.visible);
}

function bodyHex(group: THREE.Group): number {
  const mesh = group.getObjectByName('gear-body') as THREE.Mesh;
  const mat = mesh.material as THREE.MeshStandardMaterial;
  return mat.color.getHex();
}

function gearGroupAt(scene: THREE.Scene, x: number, y: number, z: number): THREE.Group | null {
  let found: THREE.Group | null = null;
  scene.traverse((obj) => {
    if (found || !(obj instanceof THREE.Group) || obj.name !== 'gearwheel') return;
    const p = obj.position;
    if (Math.abs(p.x - x) < 1e-6 && Math.abs(p.y - y) < 1e-6 && Math.abs(p.z - z) < 1e-6) {
      found = obj as THREE.Group;
    }
  });
  return found;
}

describe('Unit 7.3d: defect notch + detected_object', () => {
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
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as any;
    const fakeTool0Link = new THREE.Object3D();
    fakeTool0Link.name = 'tool0';
    const fakeRobot = new THREE.Group() as any;
    fakeRobot.name = 'ur5e-mock';
    fakeRobot.links = { tool0: fakeTool0Link };
    fakeRobot.joints = {};
    fakeRobot.setJointValue = vi.fn();
    fakeRobot.add(fakeTool0Link);
    vi.spyOn(robotLoader, 'loadRobotModel').mockResolvedValue(fakeRobot as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const stepFrame = () => {
    const cbs = [...rafCallbacks];
    rafCallbacks.length = 0;
    cbs.forEach((cb) => cb(performance.now()));
  };

  async function mountVisualizer(telemetryBufferRef: any) {
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
    return (window as any).__robot_visualizer;
  }

  it('sound gear shows no notch; defective gear shows notch', async () => {
    const telemetryBufferRef = snapBuffer([
      { id: 's1', x: 0.5, y: 0.0, z: 0.0, color: 'GREEN', intact: true },
      { id: 'd1', x: 0.55, y: 0.05, z: 0.0, color: 'GREEN', intact: false },
    ]);
    const visualizer = await mountVisualizer(telemetryBufferRef);
    act(() => {
      stepFrame();
    });
    const scene = visualizer.getScene() as THREE.Scene;
    const sound = gearGroupAt(scene, 0.5, 0.0, 0.0)!;
    const defective = gearGroupAt(scene, 0.55, 0.05, 0.0)!;
    expect(sound).not.toBeNull();
    expect(defective).not.toBeNull();
    expect(visualizer.getSnapshotGearIntact('s1')).toBe(true);
    expect(visualizer.getSnapshotGearIntact('d1')).toBe(false);
    expect(notchVisible(sound)).toBe(false);
    expect(notchVisible(defective)).toBe(true);
    expect(bodyHex(sound)).toBe(GEAR_CLASSIFIED_HEX.GREEN.body);
    expect(bodyHex(defective)).toBe(GEAR_CLASSIFIED_HEX.GREEN.body);
  });

  it('notch survives recolor-on-echo, bucket routing, and bin placement', async () => {
    const telemetryBufferRef = snapBuffer([{ id: 'g1', x: 0.5, y: 0.0, z: 0.0 }]);
    const visualizer = await mountVisualizer(telemetryBufferRef);
    act(() => {
      stepFrame();
    });
    let scene = visualizer.getScene() as THREE.Scene;
    expect(notchVisible(gearGroupAt(scene, 0.5, 0.0, 0.0)!)).toBe(false);

    act(() => {
      telemetryBufferRef.current.workcellState.spawned = [
        { id: 'g1', x: 0.5, y: 0.0, z: 0.0, color: 'BLUE', intact: false },
      ];
      stepFrame();
    });
    scene = visualizer.getScene() as THREE.Scene;
    const echoed = gearGroupAt(scene, 0.5, 0.0, 0.0)!;
    expect(bodyHex(echoed)).toBe(GEAR_CLASSIFIED_HEX.BLUE.body);
    expect(notchVisible(echoed)).toBe(true);

    act(() => {
      telemetryBufferRef.current.workcellState.spawned = [];
      telemetryBufferRef.current.workcellState.inProgress = [
        { id: 'g1', x: 0.5, y: 0.0, z: 0.0, origin_x: 0.5, origin_y: 0.0, origin_z: 0.0, color: 'BLUE', intact: false },
      ];
      stepFrame();
    });
    expect(visualizer.isGearAttached()).toBe(true);
    expect(notchVisible(visualizer.getAttachedGearMesh() as THREE.Group)).toBe(true);

    act(() => {
      telemetryBufferRef.current.workcellState.inProgress = [];
      telemetryBufferRef.current.workcellState.processed = [
        { id: 'g1', x: SCRAP_BIN[0], y: SCRAP_BIN[1], z: 0.0, origin_x: 0.5, origin_y: 0.0, origin_z: 0.0, color: 'BLUE', intact: false },
      ];
      stepFrame();
    });
    scene = visualizer.getScene() as THREE.Scene;
    const binned = gearGroupAt(scene, SCRAP_BIN[0], SCRAP_BIN[1], 0.0)!;
    expect(binned).not.toBeNull();
    expect(notchVisible(binned)).toBe(true);
    expect(visualizer.isScrapBinNonEmpty()).toBe(true);
  });

  it('clearing workspace removes notch mesh with the gear', async () => {
    const telemetryBufferRef = snapBuffer([], [], [
      { id: 'd1', x: SCRAP_BIN[0], y: SCRAP_BIN[1], z: 0.0, color: 'BLUE', intact: false },
    ]);
    const visualizer = await mountVisualizer(telemetryBufferRef);
    act(() => {
      stepFrame();
    });
    expect(visualizer.getSnapshotGearCount()).toBe(1);
    act(() => {
      telemetryBufferRef.current.workcellState.processed = [];
      stepFrame();
    });
    expect(visualizer.getSnapshotGearCount()).toBe(0);
    expect(visualizer.isScrapBinNonEmpty()).toBe(false);
  });
});
