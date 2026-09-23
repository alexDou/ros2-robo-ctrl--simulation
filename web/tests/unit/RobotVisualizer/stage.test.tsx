import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/preact';
import * as THREE from 'three';
import { RobotVisualizer } from '@components/RobotVisualizer';
import * as robotLoader from '@utils/robotLoader';
describe('Unit 3.2: RobotVisualizer Component', () => {
  let mockRenderer: any;
  let mockControls: any;
  let rafCallbacks: ((time: number) => void)[] = [];
  let nextRafId = 1;
  let cancelRafSpy: any;

  beforeEach(() => {
    rafCallbacks = [];
    nextRafId = 1;

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      const id = nextRafId++;
      rafCallbacks.push(cb as any);
      return id;
    });
    cancelRafSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});

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



  it('renders canvas element and visualizer container', () => {
    render(<RobotVisualizer rendererFactory={() => mockRenderer} controlsFactory={() => mockControls} />);

    const container = screen.getByTestId('robot-visualizer');
    expect(container).toBeDefined();

    const canvas = screen.getByTestId('robot-canvas');
    expect(canvas).toBeDefined();
  });

  it('configures ground grid helper at floor level under table and pedestal with 10cm subdivisions', () => {
    let capturedScene: THREE.Scene | null = null;

    render(
      <RobotVisualizer
        rendererFactory={() => mockRenderer}
        controlsFactory={() => mockControls}
        onSceneReady={(scene) => {
          capturedScene = scene;
        }}
      />
    );

    expect(capturedScene).not.toBeNull();
    const gridHelper = capturedScene!.children.find(
      (child) => child instanceof THREE.GridHelper
    ) as THREE.GridHelper | undefined;

    expect(gridHelper).toBeDefined();
    // Grid positioned at floor level (y = -0.255m) beneath pedestal foot and table legs
    expect(gridHelper?.position.y).toBeCloseTo(-0.255, 3);
  });

  it('configures balanced ambient and directional key lighting', () => {
    let capturedScene: THREE.Scene | null = null;

    render(
      <RobotVisualizer
        rendererFactory={() => mockRenderer}
        controlsFactory={() => mockControls}
        onSceneReady={(scene) => {
          capturedScene = scene;
        }}
      />
    );

    expect(capturedScene).not.toBeNull();
    const ambient = capturedScene!.children.find((c) => c instanceof THREE.AmbientLight);
    const directional = capturedScene!.children.find((c) => c instanceof THREE.DirectionalLight);

    expect(ambient).toBeDefined();
    expect(directional).toBeDefined();
  });

  it('configures OrbitControls centered on robot shoulder with zoom and polar limits', () => {
    let capturedControls: any = null;

    render(
      <RobotVisualizer
        rendererFactory={() => mockRenderer}
        controlsFactory={() => mockControls}
        onSceneReady={(_, __, controls) => {
          capturedControls = controls;
        }}
      />
    );

    expect(capturedControls).toBeDefined();
    // Shoulder center target y > 0
    expect(capturedControls.target.y).toBeGreaterThan(0.1);
    // Polar angle strictly <= Math.PI / 2 preventing underground traversal
    expect(capturedControls.maxPolarAngle).toBeLessThanOrEqual(Math.PI / 2);
    // Min/max zoom distance boundaries
    expect(capturedControls.minDistance).toBeGreaterThan(0.1);
    expect(capturedControls.maxDistance).toBeLessThan(10.0);
    expect(capturedControls.minDistance).toBeLessThan(capturedControls.maxDistance);
  });

  it('loads UR5e model via robotLoader with REP-103 frame alignment', async () => {
    const fakeRobot = new THREE.Group() as any;
    fakeRobot.isURDFRobot = true;
    fakeRobot.joints = {};

    const loadSpy = vi.spyOn(robotLoader, 'loadRobotModel').mockResolvedValue(fakeRobot);
    let capturedScene: THREE.Scene | null = null;

    await act(async () => {
      render(
        <RobotVisualizer
          rendererFactory={() => mockRenderer}
          controlsFactory={() => mockControls}
          onSceneReady={(scene) => {
            capturedScene = scene;
          }}
        />
      );
    });

    expect(loadSpy).toHaveBeenCalled();
    expect(capturedScene).not.toBeNull();
    const sceneNonNull = capturedScene!;
    const robotRoot = sceneNonNull.children.find((c: THREE.Object3D) => c.name === 'robot-root') as THREE.Group;
    expect(robotRoot).toBeDefined();
    // REP-103 rotation: -Math.PI / 2 on X
    expect(robotRoot.rotation.x).toBeCloseTo(-Math.PI / 2, 4);
  });

  it('cleanly disposes WebGL context, geometries, materials, controls, and cancels animation frame on unmount', () => {
    let capturedScene: THREE.Scene | null = null;

    const { unmount } = render(
      <RobotVisualizer
        rendererFactory={() => mockRenderer}
        controlsFactory={() => mockControls}
        onSceneReady={(scene) => {
          capturedScene = scene;
        }}
      />
    );

    expect(capturedScene).not.toBeNull();
    const dummyGeom = new THREE.BufferGeometry();
    const dummyMat = new THREE.MeshBasicMaterial();
    const geomDisposeSpy = vi.spyOn(dummyGeom, 'dispose');
    const matDisposeSpy = vi.spyOn(dummyMat, 'dispose');

    const testMesh = new THREE.Mesh(dummyGeom, dummyMat);
    capturedScene!.add(testMesh);

    // Unmount
    unmount();

    // Verify cleanup
    expect(cancelRafSpy).toHaveBeenCalled();
    expect(mockControls.dispose).toHaveBeenCalled();
    expect(mockRenderer.forceContextLoss).toHaveBeenCalled();
    expect(mockRenderer.dispose).toHaveBeenCalled();
    expect(geomDisposeSpy).toHaveBeenCalled();
    expect(matDisposeSpy).toHaveBeenCalled();
  });
});
