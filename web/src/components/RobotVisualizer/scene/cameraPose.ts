import * as THREE from 'three';

/** A camera pose in REP-103 `base_link` coordinates (+X forward, +Y left, +Z up). */
export interface RepCameraPose {
  position: readonly [number, number, number];
  target: readonly [number, number, number];
}

/**
 * Robot's right side, framing the full arm with hopper, belt, bin and all three towers unobstructed.
 * Chosen by Playwright screenshot from 8 candidates (Unit 8.2e); the wireframe's start pose
 * (0.2, -1.9, 1.4) -> (0.1, 0, 0.1) cropped the upright arm, so the target is raised and the
 * camera pulled back and forward toward the belt.
 */
export const DEFAULT_CAMERA_POSE: RepCameraPose = {
  position: [0.6, -2.0, 1.5],
  target: [0.1, 0.05, 0.3],
};

/**
 * Maps a REP-103 point into world space through the robot group's own transform (no manual axis
 * swizzling). Only `matrix` is refreshed, never `matrixWorld`, so the render loop stays the sole
 * owner of world matrices. Assumes the group hangs directly off the scene root.
 */
export function repToWorld(robotGroup: THREE.Object3D, rep: readonly [number, number, number]) {
  robotGroup.updateMatrix();
  return new THREE.Vector3(...rep).applyMatrix4(robotGroup.matrix);
}
