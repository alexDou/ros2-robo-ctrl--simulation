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
