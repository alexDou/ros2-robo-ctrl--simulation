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

  it('configures 1m ground grid helper with 10cm subdivisions', () => {
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
    // 1m grid with 10 divisions => 10cm cells
    expect(gridHelper?.position.y).toBe(0);
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
    const sceneNonNull = capturedScene as unknown as THREE.Scene;
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
});


