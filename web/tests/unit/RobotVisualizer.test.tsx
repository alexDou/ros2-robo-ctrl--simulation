import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/preact';
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

  const stepFrame = () => {
    const cbs = [...rafCallbacks];
    rafCallbacks.length = 0;
    cbs.forEach((cb) => cb(performance.now()));
  };

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
      jointPositionsRef.current = [0.25, 0.0, 0.0, 0.0, 0.0, 0.0];
      act(() => {
        stepFrame();
      });
      expect(mockRenderer.render).toHaveBeenCalledTimes(2);

      // Frame 4: unchanged positions => render SKIPPED
      act(() => {
        stepFrame();
      });
      expect(mockRenderer.render).toHaveBeenCalledTimes(2);

      // Frame 5: camera movement via controls.update() returning true => draw call executed
      mockControls.update.mockReturnValue(true);
      act(() => {
        stepFrame();
      });
      expect(mockRenderer.render).toHaveBeenCalledTimes(3);

      // Reset controls movement
      mockControls.update.mockReturnValue(false);
      act(() => {
        stepFrame();
      });
      expect(mockRenderer.render).toHaveBeenCalledTimes(3);
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
      jointPositionsRef.current = [Math.PI / 2, 0, 0, 0, 0, 0];
      act(() => {
        stepFrame();
      });

      // World matrix of shoulder_link has updated
      expect(fakeRobot.setJointValue).toHaveBeenCalledWith('shoulder_pan_joint', Math.PI / 2);
      expect(shoulderLink.matrixWorld.equals(initialWorldMatrix)).toBe(false);

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

    it('displays loading overlay while URDF model is loading', () => {
      vi.spyOn(robotLoader, 'loadRobotModel').mockReturnValue(new Promise(() => {})); // Never resolves

      render(
        <RobotVisualizer
          rendererFactory={() => undefined as any}
          controlsFactory={() => mockControls}
        />
      );

      const loadingOverlay = screen.queryByTestId('visualizer-loading-overlay');
      expect(loadingOverlay).not.toBeNull();
    });

    it('displays error overlay when WebGL context creation throws', () => {
      render(
        <RobotVisualizer
          rendererFactory={() => {
            throw new Error('WebGL blocklisted');
          }}
          controlsFactory={() => mockControls}
        />
      );

      const errorOverlay = screen.queryByTestId('visualizer-error-overlay');
      expect(errorOverlay).not.toBeNull();
      expect(errorOverlay?.textContent).toContain('WebGL Context Unavailable');
    });

    it('displays error overlay when loadRobotModel rejects', async () => {
      vi.spyOn(robotLoader, 'loadRobotModel').mockRejectedValue(new Error('Network timeout'));

      await act(async () => {
        render(
          <RobotVisualizer
            rendererFactory={() => mockRenderer}
            controlsFactory={() => mockControls}
          />
        );
      });

      const errorOverlay = await screen.findByTestId('visualizer-error-overlay');
      expect(errorOverlay).not.toBeNull();
      expect(errorOverlay?.textContent).toContain('Failed to Load Robot URDF');
    });
  });

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

    it('mounts WorkcellTable slab (0.8m x 0.6m) inside robotGroup flush at Z = 0.0m with open flanks', async () => {
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
      expect(visualizer).toBeDefined();

      const tableMesh = visualizer.getTableMesh();
      expect(tableMesh).toBeDefined();
      expect(tableMesh.name).toBe('workcell-table');

      // Slab dimensions: 0.8m x 0.6m (width and depth)
      const geom = tableMesh.geometry as THREE.BoxGeometry;
      expect(geom).toBeDefined();
      const dims = [geom.parameters.width, geom.parameters.height];
      expect(dims).toContain(0.8);
      expect(dims).toContain(0.6);

      // Top surface flush at Z = 0.0m
      const thickness = geom.parameters.depth;
      expect(tableMesh.position.z + thickness / 2).toBeCloseTo(0.0, 4);

      // Center position
      expect(tableMesh.position.x).toBeCloseTo(0.55, 2);
      expect(tableMesh.position.y).toBeCloseTo(0.0, 2);
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
          />
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

    it('mounts dark ESD landing mat and technical boundary border across reachability zone', async () => {
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
      const mat = visualizer.getLandingMatMesh();
      expect(mat).toBeDefined();
      expect(mat.name).toBe('workcell-landing-mat');

      const matGeom = mat.geometry as THREE.BoxGeometry;
      expect(matGeom.parameters.width).toBeCloseTo(0.30, 2);
      expect(matGeom.parameters.height).toBeCloseTo(0.44, 2);
      expect(matGeom.parameters.depth).toBeCloseTo(0.004, 3);

      const matMat = mat.material as THREE.MeshStandardMaterial;
      expect(matMat.color.getHex()).toBe(0x0f172a);
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
        telemetryBufferRef.current.workcellState.spawned = [{ id: 'g1', x: 0.5, y: 0.1, z: 0.0 }];
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
      const telemetryBufferRef = snapBuffer([{ id: 'g1', x: 0.5, y: 0.0, z: 0.0 }]);
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
      const telemetryBufferRef = snapBuffer([{ id: 'g1', x: 0.5, y: 0.0, z: 0.0 }]);
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
      const telemetryBufferRef = snapBuffer([{ id: 'g1', x: 0.5, y: 0.0, z: 0.0 }]);

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
      const telemetryBufferRef = snapBuffer([{ id: 'g1', x: 0.5, y: 0.0, z: 0.0 }]);

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
          { id: 'g1', x: 0.5, y: 0.0, z: 0.0, origin_x: 0.5, origin_y: 0.0, origin_z: 0.0 },
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
        { id: 'g1', x: 0.4, y: -0.3, z: 0.0, origin_x: 0.5, origin_y: 0.0, origin_z: 0.0 },
        { id: 'g2', x: 0.4, y: -0.3, z: 0.02, origin_x: 0.55, origin_y: 0.0, origin_z: 0.0 },
        { id: 'g3', x: 0.4, y: -0.3, z: 0.04, origin_x: 0.6, origin_y: 0.0, origin_z: 0.0 },
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
        [{ id: 'g-table', x: 0.5, y: 0.0, z: 0.0 }],
        [],
        [{ id: 'g-tower', x: 0.4, y: -0.3, z: 0.0 }]
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

    it('EXECUTING/IDLE robotState transitions never mutate snapshot meshes', async () => {
      const telemetryBufferRef = snapBuffer([{ id: 'g1', x: 0.5, y: 0.0, z: 0.0 }]);

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
          { id: 'g1', x: 0.4, y: -0.3, z: 0.0, origin_x: 0.5, origin_y: 0.0, origin_z: 0.0 },
        ];
        stepFrame();
      });
      expect(visualizer.getTowerGearCount()).toBe(1);
      expect(visualizer.getTowerGears()[0].position.z).toBeCloseTo(0.0, 3);
    });




  });
});
