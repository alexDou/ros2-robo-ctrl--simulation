/**
 * URDF loading and static mesh package resolution utilities for UR5e.
 *
 * Note on Coordinate Frames:
 * Upstream URDF models conform to ROS REP-103 (+X forward, +Y left, +Z up).
 * WebGL / Three.js default frame conventions are (+X right, +Y up, +Z back).
 * When mounting URDFRobot into the Three.js scene, align frames via root group rotation:
 * `robotGroup.rotation.x = -Math.PI / 2` (per Phase 3 spec and ADR-0001).
 * Do NOT manually swizzle quaternion components.
 */
import { LoadingManager, type Object3D } from 'three';
import URDFLoader, { type URDFRobot, type URDFJoint } from 'urdf-loader';
import { UR5E_JOINTS, type UR5eJoint } from '@contracts';

export const DEFAULT_PACKAGE_MAP: Record<string, string> = {
  ur_description: '/models/ur_description',
};

export const DEFAULT_UR5E_URDF_PATH = '/models/ur5e/ur5e.urdf';

export interface RobotLoaderOptions {
  manager?: LoadingManager;
  packages?: string | Record<string, string> | ((targetPkg: string) => string);
  assetBaseUrl?: string;
  loadMeshCb?: (
    url: string,
    manager: LoadingManager,
    onLoad: (mesh: Object3D, err?: Error) => void
  ) => void;
  parseVisual?: boolean;
  parseCollision?: boolean;
  fetchOptions?: RequestInit;
  workingPath?: string;
}

/**
 * Resolves a ROS `package://<pkg_name>/...` URI to a static URL path.
 * Normalizes trailing slashes on package base paths.
 */
export function resolvePackageUri(
  uri: string,
  packages: Record<string, string> = DEFAULT_PACKAGE_MAP
): string {
  if (!uri.startsWith('package://')) {
    return uri;
  }
  const match = uri.slice('package://'.length).match(/^([^/]+)(\/.*)$/);
  if (!match) return uri;
  const [, pkgName, rest] = match;
  const target = packages[pkgName];
  if (!target) {
    throw new Error(`Package not found in package map: ${pkgName}`);
  }
  const normalizedTarget = target.replace(/\/+$/, '');
  return `${normalizedTarget}${rest}`;
}

/**
 * Creates and configures a URDFLoader with default package mappings for ur_description.
 */
export function createRobotLoader(options: RobotLoaderOptions = {}): URDFLoader {
  const manager = options.manager || new LoadingManager();
  const loader = new URDFLoader(manager);

  loader.parseVisual = options.parseVisual ?? true;
  loader.parseCollision = options.parseCollision ?? false;

  if (options.workingPath) {
    loader.workingPath = options.workingPath;
  }

  if (options.fetchOptions) {
    loader.fetchOptions = options.fetchOptions;
  }

  if (options.loadMeshCb) {
    loader.loadMeshCb = options.loadMeshCb;
  }

  if (options.packages) {
    loader.packages = options.packages;
  } else if (options.assetBaseUrl) {
    const base = options.assetBaseUrl.replace(/\/+$/, '');
    loader.packages = {
      ur_description: `${base}${DEFAULT_PACKAGE_MAP.ur_description}`,
    };
  } else {
    loader.packages = { ...DEFAULT_PACKAGE_MAP };
  }

  return loader;
}

/**
 * Verifies that the URDFRobot instance contains all 6 canonical UR5e joints.
 */
export function verifyCanonicalJoints(robot: URDFRobot): boolean {
  if (!robot || !robot.joints) return false;
  return UR5E_JOINTS.every((jointName) => robot.joints[jointName] !== undefined);
}

/**
 * Extracts the 6 canonical UR5e revolute joints in deterministic kinematic sequence.
 */
export function getCanonicalJoints(robot: URDFRobot): URDFJoint[] {
  return UR5E_JOINTS.map((name: UR5eJoint) => {
    const joint = robot.joints[name];
    if (!joint) {
      throw new Error(`Missing canonical UR5e joint: ${name}`);
    }
    return joint;
  });
}

/**
 * High-throughput zero-allocation joint applicator for 60 FPS animation loops.
 * Evaluates angles against current values and updates only when modified,
 * avoiding per-frame string key lookups and object allocations.
 *
 * @returns true if any joint angle was updated; false if static.
 */
export function applyJointPositions(
  joints: readonly URDFJoint[],
  positions: readonly number[]
): boolean {
  let changed = false;
  const count = Math.min(joints.length, positions.length);
  for (let i = 0; i < count; i++) {
    const joint = joints[i];
    const pos = positions[i];
    if (joint.angle !== pos) {
      joint.setJointValue(pos);
      changed = true;
    }
  }
  return changed;
}

/**
 * Parses URDF XML text synchronously into a URDFRobot Object3D graph.
 */
export function parseRobotModel(
  urdfContent: string | Element | Document,
  loader: URDFLoader = createRobotLoader()
): URDFRobot {
  return loader.parse(urdfContent);
}

/**
 * Asynchronously loads a URDF file and all associated mesh assets.
 * Resolves only when the robot model and all static BufferGeometry meshes
 * have finished loading and parsing.
 *
 * Cleans up all LoadingManager callbacks upon completion to prevent memory leaks
 * and state pollution.
 */
export async function loadRobotModel(
  url: string = DEFAULT_UR5E_URDF_PATH,
  loader: URDFLoader = createRobotLoader()
): Promise<URDFRobot> {
  return new Promise((resolve, reject) => {
    const manager = loader.manager;
    let settled = false;
    let robot: URDFRobot | null = null;
    let urdfParsed = false;

    const prevOnLoad = manager.onLoad;
    const prevOnError = manager.onError;

    let onLoadFiredBeforeRobot = false;

    const cleanup = () => {
      manager.onLoad = prevOnLoad;
      manager.onError = prevOnError;
    };

    const safeResolve = (model: URDFRobot) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(model);
    };

    const safeReject = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    manager.onLoad = () => {
      if (prevOnLoad) prevOnLoad();
      if (robot && urdfParsed) {
        safeResolve(robot);
      } else {
        onLoadFiredBeforeRobot = true;
      }
    };

    manager.onError = (itemUrl: string) => {
      if (prevOnError) prevOnError(itemUrl);
      safeReject(new Error(`Failed to load robot asset: ${itemUrl}`));
    };

    loader.load(
      url,
      (loadedRobot) => {
        robot = loadedRobot;
        urdfParsed = true;
        if (onLoadFiredBeforeRobot) {
          safeResolve(loadedRobot);
        }
      },
      undefined,
      (err) => {
        safeReject(err instanceof Error ? err : new Error(String(err)));
      }
    );
  });
}
