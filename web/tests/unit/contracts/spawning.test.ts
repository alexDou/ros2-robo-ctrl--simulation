import { describe, it, expect } from 'vitest';
import {
  CommandType,
  SpawnObjectType,
  SpawnObjectTypeSchema,
  spawnObjectTypeSchema,
  SpawnObjectPayloadSchema,
  spawnObjectPayloadSchema,
  ClearWorkspacePayloadSchema,
  clearWorkspacePayloadSchema,
  isRobotCommand,
  isSpawnObjectPayload,
  isClearWorkspacePayload,
} from '@contracts';
import {
  parseSpawnObjectPayload,
  parseClearWorkspacePayload,
  createSpawnObjectCommand,
  createClearWorkspaceCommand,
} from '@domain/parsers';

describe('TypeScript Domain Schemas & Contracts', () => {
  describe('Unit 5.0: Spawning Contracts & Workcell Commands', () => {
    describe('SpawnObjectPayload & SpawnObjectType', () => {
      it('validates SpawnObjectType enum values', () => {
        expect(SpawnObjectType.GEAR).toBe('GEAR');
        expect(SpawnObjectTypeSchema.parse('GEAR')).toBe('GEAR');
        expect(spawnObjectTypeSchema).toBe(SpawnObjectTypeSchema);
        expect(() => SpawnObjectTypeSchema.parse('WIDGET')).toThrow(/Invalid spawn object type/);
      });

      it('parses valid SpawnObjectPayload', () => {
        const payload = { x: 0.5, y: -0.1, z: 0.0, object_type: 'GEAR' as const };
        const parsed = parseSpawnObjectPayload(payload);
        expect(parsed.x).toBe(0.5);
        expect(parsed.y).toBe(-0.1);
        expect(parsed.z).toBe(0.0);
        expect(parsed.object_type).toBe('GEAR');

        const fromJson = parseSpawnObjectPayload(JSON.stringify(payload));
        expect(fromJson).toEqual(payload);
        expect(isSpawnObjectPayload(payload)).toBe(true);
        expect(SpawnObjectPayloadSchema).toBe(spawnObjectPayloadSchema);
      });

      it('rejects malformed SpawnObjectPayload', () => {
        expect(() =>
          parseSpawnObjectPayload({ x: 'not-a-number', y: 0, z: 0, object_type: 'GEAR' })
        ).toThrow();
        expect(() => parseSpawnObjectPayload({ x: 0.5, y: 0 })).toThrow();
        expect(() =>
          parseSpawnObjectPayload({ x: 0.5, y: 0, z: 0, object_type: 'INVALID' })
        ).toThrow();
        expect(() =>
          parseSpawnObjectPayload({ x: 0.5, y: 0, z: 0, object_type: 'GEAR', extra: true })
        ).toThrow();
      });
    });

    describe('ClearWorkspacePayload', () => {
      it('parses valid empty ClearWorkspacePayload', () => {
        const parsed = parseClearWorkspacePayload({});
        expect(parsed).toEqual({});

        const fromJson = parseClearWorkspacePayload('{}');
        expect(fromJson).toEqual({});
        expect(isClearWorkspacePayload({})).toBe(true);
        expect(ClearWorkspacePayloadSchema).toBe(clearWorkspacePayloadSchema);
      });

      it('rejects ClearWorkspacePayload with unexpected properties', () => {
        expect(() => parseClearWorkspacePayload({ rogue_key: 'invalid' })).toThrow();
        expect(isClearWorkspacePayload({ rogue_key: 'invalid' })).toBe(false);
      });
    });

    describe('Command Creators', () => {
      it('creates valid SPAWN_OBJECT RobotCommand', () => {
        const cmd = createSpawnObjectCommand({
          x: 0.5,
          y: 0.2,
          z: 0.0,
          object_type: 'GEAR',
        });
        expect(cmd.type).toBe(CommandType.SPAWN_OBJECT);
        expect(cmd.payload).toEqual({
          x: 0.5,
          y: 0.2,
          z: 0.0,
          object_type: 'GEAR',
        });
        expect(isRobotCommand(cmd)).toBe(true);
      });

      it('creates valid CLEAR_WORKSPACE RobotCommand', () => {
        const cmd = createClearWorkspaceCommand();
        expect(cmd.type).toBe(CommandType.CLEAR_WORKSPACE);
        expect(cmd.payload).toEqual({});
        expect(isRobotCommand(cmd)).toBe(true);
      });
    });
  });
});

describe('Finite-float guards (semgrep ros2-float-coord)', () => {
  it('rejects non-finite SpawnObjectPayload coordinates', async () => {
    const { parseSpawnObjectPayload } = await import('@domain/parsers');
    for (const bad of [Infinity, -Infinity, NaN]) {
      expect(() => parseSpawnObjectPayload({ x: bad, y: 0, z: 0, object_type: 'GEAR' })).toThrow(
        /finite|must be a number/
      );
    }
  });
});
