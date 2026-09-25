import { describe, it, expect } from 'vitest';
import {
  CommandType,
  PickAndPlaceTargetPayloadSchema,
  pickAndPlaceTargetPayloadSchema,
  isRobotCommand,
  isPickAndPlaceTargetPayload,
  type PickAndPlaceTargetPayload,
} from '@contracts';
import {
  parseRobotCommand,
  parsePickAndPlaceTargetPayload,
  createPickAndPlaceTargetCommand,
} from '@domain/parsers';

describe('TypeScript Domain Schemas & Contracts', () => {
  describe('Unit 6.0: Autonomous Pick-and-Place Contracts & Wire Types', () => {
    describe('PickAndPlaceTargetPayload & Schemas', () => {
      it('parses valid PickAndPlaceTargetPayload with pick coordinates only', () => {
        const payload = { pick_x: 0.5, pick_y: 0.1, pick_z: 0.0 };
        const parsed = parsePickAndPlaceTargetPayload(payload);
        expect(parsed.pick_x).toBe(0.5);
        expect(parsed.pick_y).toBe(0.1);
        expect(parsed.pick_z).toBe(0.0);
        expect(parsed.drop_x).toBeUndefined();
        expect(parsed.drop_y).toBeUndefined();
        expect(parsed.drop_z).toBeUndefined();

        const fromJson = parsePickAndPlaceTargetPayload(JSON.stringify(payload));
        expect(fromJson).toEqual(payload);
        expect(isPickAndPlaceTargetPayload(payload)).toBe(true);
        expect(PickAndPlaceTargetPayloadSchema).toBe(pickAndPlaceTargetPayloadSchema);
      });

      it('parses valid PickAndPlaceTargetPayload with pick and drop coordinates', () => {
        const payload: PickAndPlaceTargetPayload = {
          pick_x: 0.45,
          pick_y: -0.2,
          pick_z: 0.0,
          drop_x: 0.4,
          drop_y: -0.3,
          drop_z: 0.02,
        };
        const parsed = parsePickAndPlaceTargetPayload(payload);
        expect(parsed).toEqual(payload);

        const fromJson = parsePickAndPlaceTargetPayload(JSON.stringify(payload));
        expect(fromJson).toEqual(payload);
        expect(isPickAndPlaceTargetPayload(payload)).toBe(true);
      });

      it('rejects malformed PickAndPlaceTargetPayload missing required fields', () => {
        expect(() => parsePickAndPlaceTargetPayload({ pick_x: 0.5, pick_y: 0.1 })).toThrow();
        expect(isPickAndPlaceTargetPayload({ pick_x: 0.5, pick_y: 0.1 })).toBe(false);
      });

      it('rejects malformed PickAndPlaceTargetPayload with non-numeric fields', () => {
        expect(() =>
          parsePickAndPlaceTargetPayload({ pick_x: 'invalid', pick_y: 0.1, pick_z: 0.0 })
        ).toThrow();
        expect(() =>
          parsePickAndPlaceTargetPayload({ pick_x: 0.5, pick_y: 0.1, pick_z: 0.0, drop_x: 'nan' })
        ).toThrow();
      });

      it('rejects PickAndPlaceTargetPayload with unexpected properties (strict)', () => {
        expect(() =>
          parsePickAndPlaceTargetPayload({
            pick_x: 0.5,
            pick_y: 0.1,
            pick_z: 0.0,
            rogue_field: 'not_allowed',
          })
        ).toThrow();
        expect(
          isPickAndPlaceTargetPayload({
            pick_x: 0.5,
            pick_y: 0.1,
            pick_z: 0.0,
            rogue_field: 'not_allowed',
          })
        ).toBe(false);
      });
    });

    describe('createPickAndPlaceTargetCommand', () => {
      it('creates valid PICK_AND_PLACE_TARGET command from payload', () => {
        const payload: PickAndPlaceTargetPayload = {
          pick_x: 0.5,
          pick_y: 0.2,
          pick_z: 0.0,
          drop_x: 0.4,
          drop_y: -0.3,
          drop_z: 0.04,
        };
        const cmd = createPickAndPlaceTargetCommand(payload, {
          senderId: 'teleop-panel',
          commandId: 'b1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
          timestampNs: 1725894942000000000n,
        });

        expect(cmd.type).toBe(CommandType.PICK_AND_PLACE_TARGET);
        expect(cmd.sender_id).toBe('teleop-panel');
        expect(cmd.command_id).toBe('b1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d');
        expect(cmd.payload).toEqual(payload);
        expect(isRobotCommand(cmd)).toBe(true);

        const serialized = JSON.stringify(cmd, (_, v) =>
          typeof v === 'bigint' ? v.toString() : v
        );
        const parsed = parseRobotCommand(serialized);
        expect(parsed.type).toBe(CommandType.PICK_AND_PLACE_TARGET);
        expect(parsed.payload).toEqual(payload);
      });

      it('creates valid PICK_AND_PLACE_TARGET command from separate pick and drop coordinates', () => {
        const pick = { x: 0.5, y: -0.1, z: 0.0 };
        const drop = { x: 0.4, y: -0.3, z: 0.02 };
        const cmd = createPickAndPlaceTargetCommand(pick, drop);

        expect(cmd.type).toBe(CommandType.PICK_AND_PLACE_TARGET);
        expect(cmd.payload).toEqual({
          pick_x: 0.5,
          pick_y: -0.1,
          pick_z: 0.0,
          drop_x: 0.4,
          drop_y: -0.3,
          drop_z: 0.02,
        });
        expect(isRobotCommand(cmd)).toBe(true);
      });

      it('creates valid PICK_AND_PLACE_TARGET command from pick coordinate only', () => {
        const pick = { x: 0.45, y: 0.15, z: 0.0 };
        const cmd = createPickAndPlaceTargetCommand(pick);

        expect(cmd.type).toBe(CommandType.PICK_AND_PLACE_TARGET);
        expect(cmd.payload).toEqual({
          pick_x: 0.45,
          pick_y: 0.15,
          pick_z: 0.0,
        });
        expect(isRobotCommand(cmd)).toBe(true);
      });

      it('creates valid command with pick coordinate and custom options', () => {
        const pick = { x: 0.45, y: 0.15, z: 0.0 };
        const cmd = createPickAndPlaceTargetCommand(pick, {
          senderId: 'custom-operator',
        });

        expect(cmd.type).toBe(CommandType.PICK_AND_PLACE_TARGET);
        expect(cmd.sender_id).toBe('custom-operator');
        expect(cmd.payload).toEqual({
          pick_x: 0.45,
          pick_y: 0.15,
          pick_z: 0.0,
        });
        expect(isRobotCommand(cmd)).toBe(true);
      });
    });
  });
});

describe('Finite-float guards (semgrep ros2-float-coord)', () => {
  it('rejects non-finite PickAndPlaceTargetPayload coordinates', async () => {
    const { parsePickAndPlaceTargetPayload } = await import('@domain/parsers');
    for (const bad of [Infinity, -Infinity, NaN]) {
      expect(() => parsePickAndPlaceTargetPayload({ pick_x: bad, pick_y: 0.1, pick_z: 0.0 })).toThrow(
        /finite|must be a number/
      );
      expect(() =>
        parsePickAndPlaceTargetPayload({ pick_x: 0.5, pick_y: 0.1, pick_z: 0.0, drop_x: bad })
      ).toThrow(/finite|must be a number/);
    }
  });
});
