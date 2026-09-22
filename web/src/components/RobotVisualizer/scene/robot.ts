import * as THREE from 'three';
import type { URDFRobot } from 'urdf-loader';
import { UR5E_JOINTS, CANONICAL_POSES } from '@contracts';
import * as robotLoader from '@utils/robotLoader';
import { disposeMaterial } from '@/utils/three/dispose';
import { createDexterousPalm } from '@/components/RobotVisualizer/assets/palm';
import type { LoadedRobotMount } from '@/components/RobotVisualizer/scene/stage';

export function setJointOnRobot(robot: URDFRobot, jointName: string, value: number): void {
  if (typeof robot.setJointValue === 'function') {
    robot.setJointValue(jointName, value);
  } else if (
    robot.joints &&
    robot.joints[jointName] &&
    typeof robot.joints[jointName].setJointValue === 'function'
  ) {
    robot.joints[jointName].setJointValue(value);
  }
}

export function initRobotAtHome(robot: URDFRobot, lastRendered: Float64Array): void {
  // Initialize loadedRobot at CANONICAL_POSES.HOME joint angles instead of 0 rad flat pose on URDF load
  const homePositions = CANONICAL_POSES.HOME;
  for (let i = 0; i < UR5E_JOINTS.length; i++) {
    const jointName = UR5E_JOINTS[i];
    const pos = homePositions[i];
    setJointOnRobot(robot, jointName, pos);
    lastRendered[i] = pos;
  }
  robot.updateMatrixWorld(true);
}

export function findFlangeMount(robot: URDFRobot): THREE.Object3D | null {
  return (
    (robot.links && (robot.links['tool0'] || robot.links['flange'] || robot.links['wrist_3_link'])) ||
    robot.getObjectByName('tool0') ||
    robot.getObjectByName('flange') ||
    robot.getObjectByName('wrist_3_link') ||
    null
  );
}

export function disposeRobotTree(robot: THREE.Object3D): void {
  robot.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(disposeMaterial);
      } else {
        disposeMaterial(mesh.material);
      }
    }
  });
}

export interface LoadRobotArgs {
  urdfUrl: string;
  assetBaseUrl?: string;
  robotGroup: THREE.Group;
  jointPositionsRef?: { current?: readonly number[] | null } | null;
  lastRendered: Float64Array;
  isDisposed: () => boolean;
  onLoaded: (robot: URDFRobot, mount: LoadedRobotMount) => void;
  onError: (err: unknown) => void;
}

export function loadRobot(args: LoadRobotArgs): void {
  const loader = robotLoader.createRobotLoader({ assetBaseUrl: args.assetBaseUrl });
  robotLoader
    .loadRobotModel(args.urdfUrl, loader)
    .then((robot) => {
      if (args.isDisposed()) {
        disposeRobotTree(robot);
        return;
      }
      args.robotGroup.add(robot);

      if (!args.jointPositionsRef?.current) {
        initRobotAtHome(robot, args.lastRendered);
      }

      // Mount Dexterous Palm to tool0 flange link with fallback chain
      const mountLink = findFlangeMount(robot);
      let palmAssets = null;
      if (mountLink) {
        palmAssets = createDexterousPalm();
        mountLink.add(palmAssets.group);
      }

      args.onLoaded(robot, { mountLink, palmAssets });
    })
    .catch((err) => {
      if (!args.isDisposed()) {
        args.onError(err);
      }
    });
}

export { robotLoader };
