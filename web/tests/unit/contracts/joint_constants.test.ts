import { describe, it, expect } from 'vitest';
import {
  UR5E_JOINTS,
  CANONICAL_UR5E_JOINTS,
  type UR5eJoint,
} from '@contracts';

describe('TypeScript Domain Schemas & Contracts', () => {
  describe('Canonical UR5e Joint Constants', () => {
    it('defines canonical UR5e joint sequence in contracts', () => {
      expect(UR5E_JOINTS).toEqual([
        'shoulder_pan_joint',
        'shoulder_lift_joint',
        'elbow_joint',
        'wrist_1_joint',
        'wrist_2_joint',
        'wrist_3_joint',
      ]);
      expect(CANONICAL_UR5E_JOINTS).toEqual(UR5E_JOINTS);
      expect(UR5E_JOINTS).toHaveLength(6);
    });

    it('enforces UR5eJoint literal union type compatibility', () => {
      const joint: UR5eJoint = 'shoulder_pan_joint';
      expect(UR5E_JOINTS.includes(joint)).toBe(true);
    });
  });
});
