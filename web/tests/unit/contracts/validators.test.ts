import { describe, it, expect } from 'vitest';
import {
  RobotCommandSchema,
  robotCommandSchema,
  RobotTelemetryEventSchema,
  robotTelemetryEventSchema,
  ErrorFrameSchema,
  errorFrameSchema,
  InferenceMetricsSchema,
  inferenceMetricsSchema,
  robotIdSchema,
  robotTopicSchema,
  isRobotCommand,
  isRobotTelemetryEvent,
  isErrorFrame,
} from '@contracts';

describe('TypeScript Domain Schemas & Contracts', () => {
  describe('Zod Validators & Type Guards', () => {
    it('validates with Zod schemas and type guards', () => {
      const validTelem = {
        timestamp_ns: 1000,
        robot_state: 'IDLE',
        joint_positions: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        workcell_state: { spawned: [], in_progress: [], processed: [] },
      };
      expect(isRobotTelemetryEvent(validTelem)).toBe(true);
      expect(isRobotTelemetryEvent(JSON.stringify(validTelem))).toBe(true);
      expect(robotTelemetryEventSchema.safeParse(validTelem).success).toBe(true);

      const invalidTelem = {
        timestamp_ns: -1,
        robot_state: 'IDLE',
        joint_positions: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
      };
      expect(isRobotTelemetryEvent(invalidTelem)).toBe(false);

      const validCmd = {
        command_id: 'cmd-1',
        sender_id: 'ui',
        timestamp_ns: '1000',
        type: 'PING',
        payload: {},
      };
      expect(isRobotCommand(validCmd)).toBe(true);
      expect(robotCommandSchema.safeParse(validCmd).success).toBe(true);
      expect(isRobotCommand({ type: 'UNKNOWN' })).toBe(false);

      const validErr = {
        type: 'ERROR',
        error_code: 'BAD_REQUEST',
        message: 'Something broke',
        timestamp_ns: 500,
      };
      expect(isErrorFrame(validErr)).toBe(true);
      expect(errorFrameSchema.safeParse(validErr).success).toBe(true);
      expect(isErrorFrame({ type: 'INFO' })).toBe(false);
    });

    it('exports PascalCase and camelCase Zod schema aliases', () => {
      expect(RobotCommandSchema).toBe(robotCommandSchema);
      expect(RobotTelemetryEventSchema).toBe(robotTelemetryEventSchema);
      expect(ErrorFrameSchema).toBe(errorFrameSchema);
      expect(InferenceMetricsSchema).toBe(inferenceMetricsSchema);
    });

    it('enforces strict schema boundaries rejecting unknown properties', () => {
      const extraPropCmd = {
        command_id: 'cmd-1',
        sender_id: 'ui',
        timestamp_ns: '1000',
        type: 'PING',
        payload: {},
        unexpected_field: 'not_allowed',
      };
      expect(robotCommandSchema.safeParse(extraPropCmd).success).toBe(false);

      const extraPropTelem = {
        timestamp_ns: 1000,
        robot_state: 'IDLE',
        joint_positions: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        rogue_field: 42,
      };
      expect(robotTelemetryEventSchema.safeParse(extraPropTelem).success).toBe(false);
    });

    it('validates and parses pattern-restricted string values using regex', () => {
      // robotIdSchema regex match and parse
      expect(robotIdSchema.parse('arm-ur5e')).toBe('arm-ur5e');
      expect(() => robotIdSchema.parse('invalid/id')).toThrow();
      expect(() => robotIdSchema.parse('invalid id')).toThrow();
      expect(() => robotIdSchema.parse('')).toThrow();

      // robotTopicSchema regex match and parse
      const parsedCommandTopic = robotTopicSchema.parse('robot/arm-ur5e/command');
      expect(parsedCommandTopic).toEqual({
        robotId: 'arm-ur5e',
        channel: 'command',
      });

      const parsedTelemetryTopic = robotTopicSchema.parse('robot/arm-ur5e/telemetry');
      expect(parsedTelemetryTopic).toEqual({
        robotId: 'arm-ur5e',
        channel: 'telemetry',
      });

      expect(() => robotTopicSchema.parse('robot/arm-ur5e/status')).toThrow();
      expect(() => robotTopicSchema.parse('other/arm-ur5e/command')).toThrow();
    });

    it('validates InferenceMetrics constraints', () => {
      const validMetrics = {
        latency_ms: 15.5,
        confidence: 0.95,
        detected_object: 'cylinder',
      };
      expect(inferenceMetricsSchema.parse(validMetrics)).toEqual(validMetrics);

      // confidence bounds [0.0, 1.0]
      expect(() =>
        inferenceMetricsSchema.parse({ ...validMetrics, confidence: 1.5 })
      ).toThrow();
      expect(() =>
        inferenceMetricsSchema.parse({ ...validMetrics, confidence: -0.1 })
      ).toThrow();

      // latency_ms non-negative
      expect(() =>
        inferenceMetricsSchema.parse({ ...validMetrics, latency_ms: -5 })
      ).toThrow();

      // detected_object non-empty
      expect(() =>
        inferenceMetricsSchema.parse({ ...validMetrics, detected_object: '' })
      ).toThrow();
    });
  });
});
