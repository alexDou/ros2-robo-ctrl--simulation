import { describe, it, expect } from 'vitest';
import {
  CommandType,
  ConveyorStatus,
  ConveyorStatusSchema,
  cellFillPayloadSchema,
  cellProcessPayloadSchema,
  cellStopPayloadSchema,
  isCellState,
  isCellFillPayload,
  isCellProcessPayload,
  isCellStopPayload,
  isRobotCommand,
  isRobotTelemetryEvent,
  parseCellState,
} from '@contracts';

describe('Unit 9.05: cell commands and cell_state contracts', () => {
  it('knows the CELL_PROCESS and CELL_STOP command types', () => {
    expect(CommandType.CELL_PROCESS).toBe('CELL_PROCESS');
    expect(CommandType.CELL_STOP).toBe('CELL_STOP');
    for (const type of ['CELL_FILL', 'CELL_PROCESS', 'CELL_STOP']) {
      expect(
        isRobotCommand({
          command_id: 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
          sender_id: 'ui-client',
          timestamp_ns: 1,
          type,
          payload: {},
        }),
      ).toBe(true);
    }
  });

  it('accepts empty cell payloads and rejects extra keys', () => {
    expect(isCellFillPayload({})).toBe(true);
    expect(isCellFillPayload({ rogue: 1 })).toBe(false);
    expect(cellFillPayloadSchema.parse('{}')).toEqual({});
    expect(isCellProcessPayload({})).toBe(true);
    expect(isCellStopPayload({})).toBe(true);
    expect(isCellProcessPayload({ rogue: 1 })).toBe(false);
    expect(isCellStopPayload({ rogue: 1 })).toBe(false);
    expect(cellProcessPayloadSchema.parse('{}')).toEqual({});
    expect(cellStopPayloadSchema.parse('{}')).toEqual({});
  });

  it('validates ConveyorStatus and CellState', () => {
    expect(ConveyorStatus.FEEDING).toBe('FEEDING');
    expect(ConveyorStatusSchema.parse('RESETTING')).toBe('RESETTING');
    expect(() => ConveyorStatusSchema.parse('BOGUS')).toThrow();
    const gear = { id: 'belt-1', x: 0.4, y: 0.5, color: 'GREEN', intact: false };
    const state = {
      conveyor_status: 'FEEDING',
      feeder_remaining: 100,
      belt_offset_m: 0.25,
      belt_gears: [gear],
    };
    expect(parseCellState(state)).toEqual(state);
    expect(isCellState({ conveyor_status: 'EMPTY' })).toBe(false);
    expect(isCellState({ ...state, rogue: 1 })).toBe(false);
    expect(isCellState({ ...state, belt_gears: [{ ...gear, color: 'RED' }] })).toBe(false);
  });

  it('carries cell_state as an optional telemetry field', () => {
    const base = {
      timestamp_ns: 1,
      robot_state: 'IDLE',
      joint_positions: [0, 0, 0, 0, 0, 0],
      palm_state: { is_grasped: false },
      workcell_state: { spawned: [], in_progress: [], processed: [] },
    };
    expect(isRobotTelemetryEvent(base)).toBe(true);
    expect(
      isRobotTelemetryEvent({
        ...base,
        cell_state: {
          conveyor_status: 'HALTED',
          belt_gears: [],
          feeder_remaining: 12,
          belt_offset_m: 1.5,
        },
      }),
    ).toBe(true);
    expect(isRobotTelemetryEvent({ ...base, cell_state: { conveyor_status: 'BOGUS' } })).toBe(
      false,
    );
  });
});

describe('Unit 9.09: Rejected Gearwheels in WorkcellState (hand-sim-ull1)', () => {
  const rejected = { id: 'belt-2', x: 0.4, y: 0.1, z: 0, color: 'BLUE', intact: false };
  const event = (workcell_state: object) => ({
    timestamp_ns: 1,
    robot_state: 'IDLE',
    joint_positions: [0, 0, 0, 0, 0, 0],
    palm_state: { is_grasped: false },
    workcell_state,
  });

  it('accepts a rejected bucket and stays optional', () => {
    const buckets = { spawned: [], in_progress: [], processed: [] };
    expect(isRobotTelemetryEvent(event({ ...buckets, rejected: [rejected] }))).toBe(true);
    expect(isRobotTelemetryEvent(event(buckets))).toBe(true);
  });

  it('rejects a malformed rejected entry', () => {
    const buckets = { spawned: [], in_progress: [], processed: [] };
    expect(
      isRobotTelemetryEvent(event({ ...buckets, rejected: [{ ...rejected, color: 'RED' }] })),
    ).toBe(false);
  });
});

describe('Unit 9.06: cell command factories (hand-sim-42d4)', () => {
  it('builds valid CELL_PROCESS and CELL_STOP commands with empty payloads', async () => {
    const { createCellFillCommand, createCellProcessCommand, createCellStopCommand } =
      await import('@domain/parsers');
    for (const [cmd, type] of [
      [createCellFillCommand({ senderId: 'ui-client' }), 'CELL_FILL'],
      [createCellProcessCommand({ senderId: 'ui-client' }), 'CELL_PROCESS'],
      [createCellStopCommand({ senderId: 'ui-client' }), 'CELL_STOP'],
    ] as const) {
      expect(cmd.type).toBe(type);
      expect(cmd.payload).toEqual({});
      expect(isRobotCommand(cmd)).toBe(true);
    }
  });
});
