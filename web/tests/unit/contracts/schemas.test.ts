import { describe, it, expect } from 'vitest';
import {
  UR5E_JOINTS,
} from '@contracts';

describe('TypeScript Domain Schemas & Contracts', () => {
  describe('Canonical JSON Schemas', () => {
    it('matches schema definitions for core contracts', async () => {
      const rawCmdSchema = await import('@schemas/robot_command.schema.json');
      const rawTelemSchema = await import('@schemas/robot_telemetry_event.schema.json');
      const rawErrorSchema = await import('@schemas/error_frame.schema.json');

      expect(rawCmdSchema.title).toBe('RobotCommand');
      expect(rawCmdSchema.properties.type.enum).toContain('PING');
      expect(rawCmdSchema.properties.type.enum).toContain('SPAWN_OBJECT');
      expect(rawCmdSchema.properties.type.enum).toContain('CLEAR_WORKSPACE');
      expect(rawCmdSchema.properties.type.enum).toContain('PICK_AND_PLACE_TARGET');
      expect(rawCmdSchema.$defs.spawn_object_payload).toBeDefined();
      expect(rawCmdSchema.$defs.clear_workspace_payload).toBeDefined();
      expect(rawCmdSchema.$defs.pick_and_place_target_payload).toBeDefined();

      expect(rawTelemSchema.title).toBe('RobotTelemetryEvent');
      expect(rawTelemSchema.properties.joint_positions.minItems).toBe(6);
      expect(rawTelemSchema.properties.joint_positions.maxItems).toBe(6);
      expect(rawTelemSchema.properties.timestamp_ns.minimum).toBe(0);
      expect(rawTelemSchema.$defs.canonical_joints.enum).toEqual(UR5E_JOINTS);

      expect(rawErrorSchema.title).toBe('ErrorFrame');
      expect(rawErrorSchema.properties.type.const).toBe('ERROR');
    });
  });
});
