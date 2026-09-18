import { describe, it, expect } from 'vitest';
import {
  UR5eKinematics,
  PickAndPlaceTrajectoryGenerator,
  ActionPhase,
  normalizeAngle,
  unwrapJointAngles,
} from '../e2e/support/kinematics';

describe('Unit Kinematics: UR5e Analytical IK & Pick-and-Place Generator', () => {
  it('normalizes angles within [-pi, pi]', () => {
    expect(normalizeAngle(0)).toBeCloseTo(0);
    expect(Math.abs(normalizeAngle(Math.PI * 3))).toBeCloseTo(Math.PI);
    expect(Math.abs(normalizeAngle(-Math.PI * 3))).toBeCloseTo(Math.PI);
    expect(normalizeAngle(Math.PI / 2)).toBeCloseTo(Math.PI / 2);
  });

  it('unwraps joint angles along shortest path without multi-revolution jumps', () => {
    const qRef = [0, 0, 0, 0, 0, 0];
    const qTarget = [0.1, -0.2, 0.3, -0.1, 0, 0];
    const unwrapped = unwrapJointAngles(qTarget, qRef);
    for (let i = 0; i < 6; i++) {
      expect(Math.abs(unwrapped[i] - qRef[i])).toBeLessThan(Math.PI);
    }
  });

  it('enforces reachability constraints on Cartesian targets', () => {
    const solver = new UR5eKinematics();

    // Table penetration
    expect(() => solver.checkReachability(0.4, 0.0, -0.05)).toThrow(/penetrate table/i);

    // Inner reachability limit (< 0.20m)
    expect(() => solver.checkReachability(0.1, 0.1, 0.0)).toThrow(/within minimum reach/i);

    // Outer reachability limit (> 0.85m)
    expect(() => solver.checkReachability(0.9, 0.0, 0.0)).toThrow(/exceeds maximum reach/i);

    // Reachable target
    expect(() => solver.checkReachability(0.5, 0.0, 0.0)).not.toThrow();
  });

  it('generates 10-step pick-and-place waypoint trajectory with correct ActionPhases and percentages', () => {
    const gen = new PickAndPlaceTrajectoryGenerator();
    const pick: [number, number, number] = [0.50, 0.00, 0.00];
    const drop: [number, number, number] = [0.40, -0.30, 0.00];

    const steps = gen.generateTrajectory(pick, drop);
    expect(steps.length).toBe(10);

    const expectedPhases = [
      ActionPhase.APPROACHING,
      ActionPhase.PICKING,
      ActionPhase.GRASPING,
      ActionPhase.LIFTING,
      ActionPhase.TRANSFERRING,
      ActionPhase.DROPPING,
      ActionPhase.RELEASING,
      ActionPhase.RETREATING,
      ActionPhase.HOMING,
      ActionPhase.COMPLETED,
    ];

    expect(steps.map((s) => s.phase)).toEqual(expectedPhases);
    expect(steps.map((s) => s.percentComplete)).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);

    // Check grasp states and pauses
    expect(steps[0].isGrasped).toBe(false);
    expect(steps[1].isGrasped).toBe(false);
    expect(steps[2].isGrasped).toBe(true);
    expect(steps[2].pauseDurationS).toBe(0.2);
    expect(steps[3].isGrasped).toBe(true);
    expect(steps[4].isGrasped).toBe(true);
    expect(steps[5].isGrasped).toBe(true);
    expect(steps[6].isGrasped).toBe(false);
    expect(steps[6].pauseDurationS).toBe(0.2);
    expect(steps[7].isGrasped).toBe(false);
    expect(steps[8].isGrasped).toBe(false);
    expect(steps[9].isGrasped).toBe(false);

    // Verify pick and drop positions match expectations
    expect(steps[1].cartesianPosition).toEqual(pick);
    expect(steps[5].cartesianPosition).toEqual(drop);

    // All joint positions have length 6 and are finite numbers
    for (const s of steps) {
      expect(s.jointPositions.length).toBe(6);
      for (const q of s.jointPositions) {
        expect(Number.isFinite(q)).toBe(true);
      }
    }
  });

  it('achieves sub-millimeter Cartesian positional accuracy on round-trip forward/inverse kinematics', () => {
    const solver = new UR5eKinematics();
    const testTargets: [number, number, number][] = [
      [0.50, 0.00, 0.10],
      [0.40, -0.30, 0.05],
      [-0.45, 0.20, 0.15],
      [0.35, 0.35, 0.00],
    ];

    for (const [x, y, z] of testTargets) {
      const q = solver.solveIk(x, y, z);
      const fk = solver.forwardKinematicsPosition(q, true);
      const err = Math.hypot(fk[0] - x, fk[1] - y, fk[2] - z);
      expect(err).toBeLessThan(0.001); // < 1mm precision
    }
  });
});
