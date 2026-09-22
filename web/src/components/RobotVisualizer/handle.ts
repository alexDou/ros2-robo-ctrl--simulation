import * as THREE from 'three';
import type { URDFRobot } from 'urdf-loader';
import { UR5E_JOINTS } from '@contracts';
import type { RobotVisualizerGlobalHandle } from '@/types/global';
import type { SnapshotStore } from '@/components/RobotVisualizer/interaction/snapshot';
import type { TableProceduralAssets } from '@/components/RobotVisualizer/assets/table';
import type { PedestalProceduralAssets } from '@/components/RobotVisualizer/assets/pedestal';
import type { SpindleTowerProceduralAssets } from '@/components/RobotVisualizer/assets/tower';

export interface HandleDeps {
  isLoaded: () => boolean;
  isDisposed: () => boolean;
  getRobot: () => URDFRobot | null;
  getScene: () => THREE.Scene;
  getRenderer: () => THREE.WebGLRenderer;
  getSpindle: () => SpindleTowerProceduralAssets | null;
  getTable: () => TableProceduralAssets | null;
  getPedestal: () => PedestalProceduralAssets | null;
  store: SnapshotStore;
  getLastRendered: () => number[];
  isLocked: () => boolean;
  simulatePointerMove: (x: number, y: number) => void;
  simulatePointerLeave: () => void;
  simulateClick: (x: number, y: number) => unknown;
  raycastPointer: (clientX: number, clientY: number) => RobotVisualizerGlobalHandle['raycastPointer'] extends (a: number, b: number) => infer R ? R : never;
  getTableScreenCoords: (x: number, y: number) => { clientX: number; clientY: number } | null;
}

// Exposed debug handle on window for testing and diagnostics.
// Preserves every probe name tests rely on.
export function createVisualizerHandle(deps: HandleDeps): RobotVisualizerGlobalHandle {
  return {
    isLoaded: () => deps.isLoaded(),
    isDisposed: () => deps.isDisposed(),
    getJointValue: (jointName: string): number | null => {
      const robot = deps.getRobot();
      if (!robot) return null;
      if (robot.joints && robot.joints[jointName]) {
        const j = robot.joints[jointName];
        return typeof j.angle === 'number' ? j.angle : (j.jointValue?.[0] ?? null);
      }
      return null;
    },
    getJointValues: (): Record<string, number> => {
      const result: Record<string, number> = {};
      const robot = deps.getRobot();
      if (!robot) return result;
      for (const j of UR5E_JOINTS) {
        if (robot.joints && robot.joints[j]) {
          const joint = robot.joints[j];
          result[j] = typeof joint.angle === 'number' ? joint.angle : (joint.jointValue?.[0] ?? 0);
        }
      }
      return result;
    },
    getLinkWorldPosition: (linkName: string): { x: number; y: number; z: number } | null => {
      const robot = deps.getRobot();
      if (!robot) return null;
      const link =
        (robot.links && robot.links[linkName]) || robot.getObjectByName(linkName);
      if (!link) return null;
      const target = new THREE.Vector3();
      link.getWorldPosition(target);
      return { x: target.x, y: target.y, z: target.z };
    },
    getLastRenderedPositions: () => deps.getLastRendered(),
    getRendererInfo: () => {
      const renderer = deps.getRenderer();
      if (!renderer || !renderer.info) return null;
      return {
        memory: {
          geometries: renderer.info.memory?.geometries ?? 0,
          textures: renderer.info.memory?.textures ?? 0,
        },
        render: {
          calls: renderer.info.render?.calls ?? 0,
          triangles: renderer.info.render?.triangles ?? 0,
          frame: renderer.info.render?.frame ?? 0,
        },
      };
    },
    getScene: () => deps.getScene(),
    getRenderer: () => deps.getRenderer(),
    getRobot: () => deps.getRobot(),
    getPalmNozzleState: () => {
      const robot = deps.getRobot();
      if (!robot) return null;
      const nozzle = robot.getObjectByName('palm-suction-nozzle') as THREE.Mesh | undefined;
      if (!nozzle || !nozzle.material || Array.isArray(nozzle.material)) return null;
      const mat = nozzle.material as THREE.MeshStandardMaterial;
      if (typeof mat.emissiveIntensity !== 'number' || !mat.emissive) return null;
      return {
        isGrasped: mat.emissiveIntensity > 0,
        emissiveHex: mat.emissive.getHex(),
        emissiveIntensity: mat.emissiveIntensity,
      };
    },
    getSpindleTowerMesh: () => deps.getSpindle()?.group ?? null,
    getSpindleBaseFlangeMesh: () => deps.getSpindle()?.flangeMesh ?? null,
    getSpindlePinMesh: () => deps.getSpindle()?.pinMesh ?? null,
    getSnapshotGearCount: () => deps.store.gears.size,
    getSnapshotGearPosition: (id: string) => {
      const rec = deps.store.gears.get(id);
      if (!rec) return null;
      const p = rec.assets.group.position;
      return { x: p.x, y: p.y, z: p.z, bucket: rec.bucket };
    },
    getSnapshotGearIds: () => [...deps.store.gears.keys()],
    getTowerGears: () =>
      [...deps.store.gears.values()]
        .filter((r) => r.bucket === 'processed')
        .map((r) => r.assets.group),
    getTowerGearCount: () =>
      [...deps.store.gears.values()].filter((r) => r.bucket === 'processed').length,
    isGearAttached: () => [...deps.store.gears.values()].some((r) => r.bucket === 'in_progress'),
    wasGearEverAttached: () => [...deps.store.gears.values()].some((r) => r.bucket === 'in_progress'),
    getAttachedGearMesh: () => {
      const rec = [...deps.store.gears.values()].find((r) => r.bucket === 'in_progress');
      return rec?.assets.group ?? null;
    },
    getTableMesh: () => deps.getTable()?.tableMesh ?? null,
    getPedestalMesh: () => deps.getPedestal()?.group ?? null,
    getLandingMatMesh: () => deps.getTable()?.matMesh ?? null,
    getReticleMesh: () => deps.getTable()?.reticleMesh ?? null,
    getGearMesh: () => {
      const rec =
        [...deps.store.gears.values()].find((r) => r.bucket === 'spawned') ??
        [...deps.store.gears.values()].find((r) => r.bucket === 'in_progress');
      return rec?.assets.group ?? null;
    },
    getGearPosition: () => {
      const rec =
        [...deps.store.gears.values()].find((r) => r.bucket === 'spawned') ??
        [...deps.store.gears.values()].find((r) => r.bucket === 'in_progress');
      if (!rec) return null;
      const pos = rec.assets.group.position;
      return { x: pos.x, y: pos.y, z: pos.z };
    },
    hasActiveGear: () =>
      [...deps.store.gears.values()].some((r) => r.bucket === 'spawned' || r.bucket === 'in_progress'),
    getSpawnedGearCount: () =>
      [...deps.store.gears.values()].filter((r) => r.bucket === 'spawned' || r.bucket === 'in_progress').length,
    isLockedOut: () => deps.isLocked(),
    clearWorkspace: () => {
      // No-op locally: workspace clears on snapshot echo (CLEAR_WORKSPACE).
    },
    simulatePointerMove: (x: number, y: number) => {
      deps.simulatePointerMove(x, y);
    },
    simulatePointerLeave: () => {
      deps.simulatePointerLeave();
    },
    simulateClick: (x: number, y: number) => {
      return deps.simulateClick(x, y);
    },
    raycastPointer: (clientX: number, clientY: number) => {
      return deps.raycastPointer(clientX, clientY);
    },
    getTableScreenCoords: (x: number, y: number) => {
      return deps.getTableScreenCoords(x, y);
    },
  };
}
