import { describe, it, expect } from 'vitest';
import {
  CommandType,
  RobotState,
  parseRobotCommand,
  parseRobotTelemetryEvent,
  parseErrorFrame,
  robotCommandTopic,
  robotTelemetryTopic,
  parseRobotTopic,
  createPingCommand,
  UR5E_JOINTS,
  CANONICAL_UR5E_JOINTS,
  type UR5eJoint,
} from '@contracts';

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

  describe('RobotTelemetryEvent', () => {
    it('parses valid RobotTelemetryEvent with 6-DoF joint positions', () => {
      const raw = {
        timestamp_ns: '1725894942000000000',
        robot_state: 'IDLE',
        joint_positions: [0.0, -1.57, 1.57, 0.0, 0.0, 0.0],
        inference_metrics: {
          latency_ms: 12.3,
          confidence: 0.99,
          detected_object: 'box',
        },
        command_id: 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
      };

      const event = parseRobotTelemetryEvent(JSON.stringify(raw));
      expect(event.robot_state).toBe(RobotState.IDLE);
      expect(event.joint_positions).toHaveLength(6);
      expect(event.joint_positions[1]).toBe(-1.57);
      expect(event.inference_metrics?.detected_object).toBe('box');
    });

    it('rejects RobotTelemetryEvent with invalid joint count', () => {
      const rawTooFew = {
        timestamp_ns: '1000',
        robot_state: 'IDLE',
        joint_positions: [0.0, 1.0], // only 2 joints
      };
      expect(() => parseRobotTelemetryEvent(JSON.stringify(rawTooFew))).toThrow(
        /must contain exactly 6 joint positions/
      );

      const raw5 = {
        timestamp_ns: '1000',
        robot_state: 'IDLE',
        joint_positions: [0.0, 1.0, 2.0, 3.0, 4.0], // 5 joints
      };
      expect(() => parseRobotTelemetryEvent(JSON.stringify(raw5))).toThrow(
        /must contain exactly 6 joint positions/
      );

      const raw7 = {
        timestamp_ns: '1000',
        robot_state: 'IDLE',
        joint_positions: [0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0], // 7 joints
      };
      expect(() => parseRobotTelemetryEvent(JSON.stringify(raw7))).toThrow(
        /must contain exactly 6 joint positions/
      );
    });

    it('rejects RobotTelemetryEvent with non-finite or non-numeric joint values', () => {
      const rawNaN = {
        timestamp_ns: '1000',
        robot_state: 'IDLE',
        joint_positions: [NaN, 0.0, 0.0, 0.0, 0.0, 0.0],
      };
      expect(() => parseRobotTelemetryEvent(rawNaN)).toThrow(/not a valid finite number/);

      const rawInf = {
        timestamp_ns: '1000',
        robot_state: 'IDLE',
        joint_positions: [0.0, Infinity, 0.0, 0.0, 0.0, 0.0],
      };
      expect(() => parseRobotTelemetryEvent(rawInf)).toThrow(/not a valid finite number/);

      const rawNegInf = {
        timestamp_ns: '1000',
        robot_state: 'IDLE',
        joint_positions: [0.0, 0.0, -Infinity, 0.0, 0.0, 0.0],
      };
      expect(() => parseRobotTelemetryEvent(rawNegInf)).toThrow(/not a valid finite number/);

      const rawString = {
        timestamp_ns: '1000',
        robot_state: 'IDLE',
        joint_positions: ['zero', 0.0, 0.0, 0.0, 0.0, 0.0],
      };
      expect(() => parseRobotTelemetryEvent(rawString)).toThrow(/not a valid finite number/);
    });

    it('rejects RobotTelemetryEvent with negative timestamp_ns', () => {
      const rawNegative = {
        timestamp_ns: -5,
        robot_state: 'IDLE',
        joint_positions: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
      };
      expect(() => parseRobotTelemetryEvent(rawNegative)).toThrow(/non-negative/);

      const rawNegativeStr = {
        timestamp_ns: '-1',
        robot_state: 'IDLE',
        joint_positions: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
      };
      expect(() => parseRobotTelemetryEvent(rawNegativeStr)).toThrow(/non-negative/);
    });

    it('rejects RobotTelemetryEvent with invalid robot_state', () => {
      const raw = {
        timestamp_ns: '1000',
        robot_state: 'DANCING',
        joint_positions: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
      };

      expect(() => parseRobotTelemetryEvent(JSON.stringify(raw))).toThrow(
        /Invalid robot state/
      );
    });
  });

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

  describe('Canonical JSON Schemas', () => {
    it('matches schema definitions for core contracts', async () => {
      const robotCommandSchema = await import('@schemas/robot_command.schema.json');
      const robotTelemetrySchema = await import('@schemas/robot_telemetry_event.schema.json');
      const errorFrameSchema = await import('@schemas/error_frame.schema.json');

      expect(robotCommandSchema.title).toBe('RobotCommand');
      expect(robotCommandSchema.properties.type.enum).toContain('PING');

      expect(robotTelemetrySchema.title).toBe('RobotTelemetryEvent');
      expect(robotTelemetrySchema.properties.joint_positions.minItems).toBe(6);
      expect(robotTelemetrySchema.properties.joint_positions.maxItems).toBe(6);
      expect(robotTelemetrySchema.properties.timestamp_ns.minimum).toBe(0);
      expect(robotTelemetrySchema.$defs.canonical_joints.enum).toEqual(UR5E_JOINTS);

      expect(errorFrameSchema.title).toBe('ErrorFrame');
      expect(errorFrameSchema.properties.type.const).toBe('ERROR');
    });
  });
});

