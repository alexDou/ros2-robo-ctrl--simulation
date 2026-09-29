import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_CAMERA_POSE, repToWorld } from '@/components/RobotVisualizer/scene/cameraPose';
import { createStage } from '@/components/RobotVisualizer/scene/stage';

describe('Unit 8.2e: default camera for the conveyor layout (hand-sim-jap7)', () => {
  it('locks the chosen REP-103 pose (right side of the robot, arm framed)', () => {
    expect(DEFAULT_CAMERA_POSE).toEqual({
      position: [0.6, -2.0, 1.5],
      target: [0.1, 0.05, 0.3],
    });
    // Right side of the robot is -Y in REP-103; the camera looks toward +Y.
    expect(DEFAULT_CAMERA_POSE.position[1]).toBeLessThan(-1.5);
    expect(DEFAULT_CAMERA_POSE.target[1]).toBeGreaterThan(DEFAULT_CAMERA_POSE.position[1]);
  });

  it('places the stage camera and orbit target at that pose in world space', () => {
    const stage = createStage(document.createElement('div'));
    const position = repToWorld(stage.robotGroup, DEFAULT_CAMERA_POSE.position);
    const target = repToWorld(stage.robotGroup, DEFAULT_CAMERA_POSE.target);
    expect(stage.camera.position.distanceTo(position)).toBeLessThan(1e-6);
    expect(stage.cameraTarget.distanceTo(target)).toBeLessThan(1e-6);
    const forward = stage.camera.getWorldDirection(new THREE.Vector3());
    const toTarget = target.clone().sub(position).normalize();
    expect(forward.dot(toTarget)).toBeGreaterThan(0.999999);
  });

  it('stays inside the orbit zoom limits so the first drag does not jump', () => {
    const stage = createStage(document.createElement('div'));
    const distance = stage.camera.position.distanceTo(stage.cameraTarget);
    expect(distance).toBeGreaterThan(0.3);
    expect(distance).toBeLessThan(3.0);
  });
});
