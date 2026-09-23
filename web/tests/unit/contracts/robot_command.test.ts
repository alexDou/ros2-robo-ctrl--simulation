import { describe, it, expect } from 'vitest';
import {
  CommandType,
} from '@contracts';
import {
  parseRobotCommand,
  createPingCommand,
} from '@domain/parsers';

describe('TypeScript Domain Schemas & Contracts', () => {
  describe('RobotCommand', () => {
    it('creates and parses valid PING RobotCommand', () => {
      const cmd = createPingCommand({
        senderId: 'ui-client',
        commandId: 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
        timestampNs: 1725894942000000000n,
      });

      expect(cmd.type).toBe(CommandType.PING);
      expect(cmd.sender_id).toBe('ui-client');
      expect(cmd.payload).toEqual({});

      const serialized = JSON.stringify(cmd, (_, v) =>
        typeof v === 'bigint' ? v.toString() : v
      );
      const parsed = parseRobotCommand(serialized);
      expect(parsed.command_id).toBe('a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d');
      expect(parsed.type).toBe(CommandType.PING);
    });

    it('rejects malformed RobotCommand with invalid command type', () => {
      const invalidJson = JSON.stringify({
        command_id: '123',
        sender_id: 'ui',
        timestamp_ns: '1000',
        type: 'FLY_TO_MARS',
        payload: {},
      });

      expect(() => parseRobotCommand(invalidJson)).toThrow(/Invalid command type/);
    });

    it('rejects RobotCommand missing required fields', () => {
      const invalidJson = JSON.stringify({
        sender_id: 'ui',
        type: 'PING',
      });

      expect(() => parseRobotCommand(invalidJson)).toThrow(/Missing required field/);
    });
  });
});
