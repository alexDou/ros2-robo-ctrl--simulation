import { describe, it, expect } from 'vitest';
import {
  parseErrorFrame,
} from '@domain/parsers';

describe('TypeScript Domain Schemas & Contracts', () => {
  describe('ErrorFrame', () => {
    it('parses valid Gateway ERROR frame', () => {
      const raw = {
        type: 'ERROR',
        error_code: 'SCHEMA_VIOLATION',
        message: 'Invalid command type',
        timestamp_ns: '1725894942000',
      };

      const err = parseErrorFrame(JSON.stringify(raw));
      expect(err.type).toBe('ERROR');
      expect(err.error_code).toBe('SCHEMA_VIOLATION');
      expect(err.message).toBe('Invalid command type');
    });

    it('rejects non-ERROR type frame', () => {
      const raw = {
        type: 'WARNING',
        error_code: 'SOMETHING',
        message: 'test',
        timestamp_ns: '1000',
      };

      expect(() => parseErrorFrame(JSON.stringify(raw))).toThrow(
        /Expected frame type 'ERROR'/
      );
    });
  });
});

describe('7hbf: ErrorFrame command_id correlation', () => {
  it('parses optional command_id for ros2/gateway/browser join', async () => {
    const { parseErrorFrame } = await import('@domain/parsers');
    const raw = {
      type: 'ERROR',
      error_code: 'ACTION_FAILED',
      message: 'PickAndPlace failed: GetDropSlot rejected',
      timestamp_ns: '1725894942000',
      command_id: 'cmd-pnp-7',
    };
    const err = parseErrorFrame(JSON.stringify(raw));
    expect(err.command_id).toBe('cmd-pnp-7');
  });

  it('accepts legacy frames without command_id', async () => {
    const { parseErrorFrame } = await import('@domain/parsers');
    const raw = {
      type: 'ERROR',
      error_code: 'ROBOT_BUSY',
      message: 'busy',
      timestamp_ns: '1725894942000',
    };
    const err = parseErrorFrame(JSON.stringify(raw));
    expect(err.command_id).toBeUndefined();
  });
});
