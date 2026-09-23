import { describe, it, expect } from 'vitest';
import {
  robotCommandTopic,
  robotTelemetryTopic,
  parseRobotTopic,
} from '@domain/parsers';

describe('TypeScript Domain Schemas & Contracts', () => {
  describe('DataFabric Key Expressions', () => {
    it('generates locked RESTful key expressions', () => {
      expect(robotCommandTopic('robot-0')).toBe('robot/robot-0/command');
      expect(robotTelemetryTopic('robot-0')).toBe('robot/robot-0/telemetry');
    });

    it('parses valid DataFabric key expressions', () => {
      expect(parseRobotTopic('robot/robot-0/command')).toEqual({
        robotId: 'robot-0',
        channel: 'command',
      });
      expect(parseRobotTopic('robot/robot-0/telemetry')).toEqual({
        robotId: 'robot-0',
        channel: 'telemetry',
      });
    });

    it('rejects malformed key expressions and robot IDs', () => {
      expect(parseRobotTopic('invalid/topic')).toBeNull();
      expect(parseRobotTopic('robot//command')).toBeNull();
      expect(parseRobotTopic('robot/0/status')).toBeNull();

      expect(() => robotCommandTopic('')).toThrow();
      expect(() => robotCommandTopic('bad/id')).toThrow();
      expect(() => robotTelemetryTopic('')).toThrow();
      expect(() => robotTelemetryTopic('bad\\id')).toThrow();
    });
  });
});
