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



  describe('Unit 3.3: 60 FPS Telemetry Kinematic Synchronization & Dirty-Checking', () => {
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
});
