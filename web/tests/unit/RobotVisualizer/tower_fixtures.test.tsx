import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/preact';
import * as THREE from 'three';
import { RobotVisualizer } from '@components/RobotVisualizer';
import * as robotLoader from '@utils/robotLoader';
import { createSpindleTower } from '@components/RobotVisualizer/assets/tower';
import {
  SPINDLE_TOWERS,
  SPINDLE_TOWER_COORDS,
  TOWER_CAPACITY,
} from '@components/RobotVisualizer/constants';
import { WHITE_TOWER, GREEN_TOWER, BLUE_TOWER, TOWER_CAPACITY as DOMAIN_CAPACITY } from '@contracts';

describe('Unit 7.3a: Web tower fixtures + constants', () => {
  it('canonical tower coords match domain WHITE/GREEN/BLUE bindings', () => {
    expect([SPINDLE_TOWERS.WHITE.x, SPINDLE_TOWERS.WHITE.y, SPINDLE_TOWERS.WHITE.z]).toEqual([...WHITE_TOWER]);
    expect([SPINDLE_TOWERS.GREEN.x, SPINDLE_TOWERS.GREEN.y, SPINDLE_TOWERS.GREEN.z]).toEqual([...GREEN_TOWER]);
    expect([SPINDLE_TOWERS.BLUE.x, SPINDLE_TOWERS.BLUE.y, SPINDLE_TOWERS.BLUE.z]).toEqual([...BLUE_TOWER]);
  });

  it('capacity constant 10 shared with domain bindings', () => {
    expect(TOWER_CAPACITY).toBe(10);
    expect(TOWER_CAPACITY).toBe(DOMAIN_CAPACITY);
  });

  it('builder is parameterized by color with no duplicated logic', () => {
    const white = createSpindleTower('WHITE');
    const green = createSpindleTower('GREEN');
    const blue = createSpindleTower('BLUE');
    expect(white.group.position.x).toBeCloseTo(0.4, 4);
    expect(green.group.position.x).toBeCloseTo(0.55, 4);
    expect(blue.group.position.x).toBeCloseTo(0.7, 4);
    for (const t of [white, green, blue]) {
      expect(t.group.position.y).toBeCloseTo(-0.3, 4);
      expect(t.group.position.z).toBeCloseTo(0.0, 4);
      expect((t.pinMesh.geometry as THREE.CylinderGeometry).parameters.height).toBeCloseTo(0.2, 4);
    }
    expect(white.group.name).toBe('spindle-tower');
    expect(white.group.userData.color).toBe('WHITE');
    expect(green.group.userData.color).toBe('GREEN');
    expect(blue.group.userData.color).toBe('BLUE');
    white.dispose();
    green.dispose();
    blue.dispose();
  });

  it('default builder renders identically to legacy single WHITE tower', () => {
    const legacy = createSpindleTower();
    expect(legacy.group.position.x).toBeCloseTo(SPINDLE_TOWER_COORDS.x, 6);
    expect(legacy.group.position.y).toBeCloseTo(SPINDLE_TOWER_COORDS.y, 6);
    expect(legacy.group.position.z).toBeCloseTo(SPINDLE_TOWER_COORDS.z, 6);
    expect(legacy.group.position.x).toBeCloseTo(SPINDLE_TOWERS.WHITE.x, 6);
    legacy.dispose();
  });

  describe('stage mounts three towers', () => {
    let mockRenderer: any;
    let mockControls: any;
    let nextRafId = 1;

    beforeEach(() => {
      nextRafId = 1;
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => {
        const id = nextRafId++;
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
      const fakeTool0 = new THREE.Object3D();
      fakeTool0.name = 'tool0';
      const fakeRobot = new THREE.Group() as any;
      fakeRobot.links = { tool0: fakeTool0 };
      fakeRobot.joints = {};
      fakeRobot.setJointValue = vi.fn();
      fakeRobot.add(fakeTool0);
      vi.spyOn(robotLoader, 'loadRobotModel').mockResolvedValue(fakeRobot);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('mounts WHITE/GREEN/BLUE towers at canonical coords, legacy probe stays on WHITE', async () => {
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
      const towers = visualizer.getSpindleTowerMeshes();
      expect(towers).toHaveLength(3);
      const byColor = visualizer.getSpindleTowerMeshByColor.bind(visualizer);
      expect(byColor('WHITE').position.x).toBeCloseTo(0.4, 2);
      expect(byColor('GREEN').position.x).toBeCloseTo(0.55, 2);
      expect(byColor('BLUE').position.x).toBeCloseTo(0.7, 2);
      const legacy = visualizer.getSpindleTowerMesh();
      expect(legacy.position.x).toBeCloseTo(0.4, 2);
      expect(legacy.position.y).toBeCloseTo(-0.3, 2);
      expect(legacy).toBe(byColor('WHITE'));
    });
  });
});
