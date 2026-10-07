import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/preact';
import * as THREE from 'three';
import { RobotVisualizer } from '@components/RobotVisualizer';
import * as robotLoader from '@utils/robotLoader';
import { pocketCoords } from '@utils/pallet';
import {
  createPalletTray,
  PALLET_TRAY_LENGTH_X,
  PALLET_TRAY_WIDTH_Y,
} from '@components/RobotVisualizer/assets/pallettray';
import { PALLET_STATIONS, PALLET_CAPACITY } from '@components/RobotVisualizer/constants';
import {
  WHITE_TOWER,
  GREEN_TOWER,
  BLUE_TOWER,
  PALLET_CAPACITY as DOMAIN_CAPACITY,
  PALLET_POCKET_DEPTH_M,
  PALLET_TRAY_HEIGHT_M,
} from '@contracts';

describe('D38: nest-tray Pallet fixtures + constants', () => {
  it('PalletStation coords match domain WHITE/GREEN/BLUE bindings', () => {
    expect([PALLET_STATIONS.WHITE.x, PALLET_STATIONS.WHITE.y, PALLET_STATIONS.WHITE.z]).toEqual([
      ...WHITE_TOWER,
    ]);
    expect([PALLET_STATIONS.GREEN.x, PALLET_STATIONS.GREEN.y, PALLET_STATIONS.GREEN.z]).toEqual([
      ...GREEN_TOWER,
    ]);
    expect([PALLET_STATIONS.BLUE.x, PALLET_STATIONS.BLUE.y, PALLET_STATIONS.BLUE.z]).toEqual([
      ...BLUE_TOWER,
    ]);
  });

  it('capacity constant 10 shared with domain bindings', () => {
    expect(PALLET_CAPACITY).toBe(10);
    expect(PALLET_CAPACITY).toBe(DOMAIN_CAPACITY);
  });

  it('builds one tray per colour on its station, top at the tray height', () => {
    for (const color of ['WHITE', 'GREEN', 'BLUE'] as const) {
      const tray = createPalletTray(color);
      expect(tray.group.name).toBe('pallet-tray');
      expect(tray.group.userData.color).toBe(color);
      expect(tray.group.position.x).toBeCloseTo(PALLET_STATIONS[color].x, 6);
      expect(tray.group.position.y).toBeCloseTo(PALLET_STATIONS[color].y, 6);
      expect(tray.group.position.z).toBeCloseTo(PALLET_STATIONS[color].z, 6);
      const box = new THREE.Box3().setFromObject(tray.group);
      expect(box.max.z - tray.group.position.z).toBeCloseTo(PALLET_TRAY_HEIGHT_M, 6);
      expect(box.max.x - box.min.x).toBeCloseTo(PALLET_TRAY_LENGTH_X, 6);
      expect(box.max.y - box.min.y).toBeCloseTo(PALLET_TRAY_WIDTH_Y, 6);
      tray.dispose();
    }
  });

  it('cuts one bore per pocket, open down to the pocket floor where a Gearwheel rests', () => {
    const tray = createPalletTray('GREEN');
    const nest = tray.nestMesh;
    expect(nest.geometry.parameters.shapes).toBeDefined();
    const shape = nest.geometry.parameters.shapes as THREE.Shape;
    expect(shape.holes).toHaveLength(PALLET_CAPACITY);
    // Bore k is centred on pocket k (station-relative).
    for (let k = 0; k < PALLET_CAPACITY; k++) {
      const [px, py] = pocketCoords([0, 0, 0], k);
      const pts = shape.holes[k].getPoints(16);
      const bounds = new THREE.Box2().setFromPoints(pts);
      const { x: cx, y: cy } = bounds.getCenter(new THREE.Vector2());
      expect(cx).toBeCloseTo(px, 3);
      expect(cy).toBeCloseTo(py, 3);
    }
    expect(nest.position.z).toBeCloseTo(PALLET_TRAY_HEIGHT_M - PALLET_POCKET_DEPTH_M, 6);
    tray.dispose();
  });

  describe('stage mounts three trays', () => {
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

    it('mounts WHITE/GREEN/BLUE trays at their PalletStations', async () => {
      let resolveLoaded: () => void;
      const loadedPromise = new Promise<void>((res) => {
        resolveLoaded = res;
      });
      render(
        <RobotVisualizer
          rendererFactory={() => mockRenderer}
          controlsFactory={() => mockControls}
          onRobotLoaded={() => resolveLoaded()}
        />,
      );
      await act(async () => {
        await loadedPromise;
      });
      const visualizer = (window as any).__robot_visualizer;
      const trays = visualizer.getPalletTrayMeshes();
      expect(trays).toHaveLength(3);
      const byColor = visualizer.getPalletTrayMeshByColor.bind(visualizer);
      for (const color of ['WHITE', 'GREEN', 'BLUE'] as const) {
        expect(byColor(color).position.x).toBeCloseTo(PALLET_STATIONS[color].x, 2);
        expect(byColor(color).position.y).toBeCloseTo(PALLET_STATIONS[color].y, 2);
      }
    });
  });
});
