import { describe, it, expect } from 'vitest';
import {
  CommandType,
  RobotState,
  UR5E_JOINTS,
  CANONICAL_UR5E_JOINTS,
  type UR5eJoint,
  PalmAction,
  PalmActionSchema,
  palmActionSchema,
  PoseName,
  PoseNameSchema,
  poseNameSchema,
  PalmStateSchema,
  palmStateSchema,
  PalmActuatePayloadSchema,
  palmActuatePayloadSchema,
  TrajectoryExecutePayloadSchema,
  trajectoryExecutePayloadSchema,
  EmergencyStopPayloadSchema,
  emergencyStopPayloadSchema,
  ResetFaultPayloadSchema,
  resetFaultPayloadSchema,
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
import {
  parseRobotCommand,
  parseRobotTelemetryEvent,
  parseErrorFrame,
  parsePalmActuatePayload,
  parseTrajectoryExecutePayload,
  parseEmergencyStopPayload,
  parseResetFaultPayload,
  parsePalmState,
  robotCommandTopic,
  robotTelemetryTopic,
  parseRobotTopic,
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

    it('parses valid RobotTelemetryEvent with null optional fields', () => {
      const rawNulls = {
        timestamp_ns: '1725894942000000000',
        robot_state: 'IDLE',
        joint_positions: [0.0, -1.57, 1.57, 0.0, 0.0, 0.0],
        inference_metrics: null,
        command_id: null,
      };

      const event = parseRobotTelemetryEvent(JSON.stringify(rawNulls));
      expect(event.robot_state).toBe(RobotState.IDLE);
      expect(event.joint_positions).toHaveLength(6);
      expect(event.inference_metrics).toBeNull();
      expect(event.command_id).toBeNull();
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
      const rawCmdSchema = await import('@schemas/robot_command.schema.json');
      const rawTelemSchema = await import('@schemas/robot_telemetry_event.schema.json');
      const rawErrorSchema = await import('@schemas/error_frame.schema.json');

      expect(rawCmdSchema.title).toBe('RobotCommand');
      expect(rawCmdSchema.properties.type.enum).toContain('PING');

      expect(rawTelemSchema.title).toBe('RobotTelemetryEvent');
      expect(rawTelemSchema.properties.joint_positions.minItems).toBe(6);
      expect(rawTelemSchema.properties.joint_positions.maxItems).toBe(6);
      expect(rawTelemSchema.properties.timestamp_ns.minimum).toBe(0);
      expect(rawTelemSchema.$defs.canonical_joints.enum).toEqual(UR5E_JOINTS);

      expect(rawErrorSchema.title).toBe('ErrorFrame');
      expect(rawErrorSchema.properties.type.const).toBe('ERROR');
    });
  });

  describe('Zod Validators & Type Guards', () => {
    it('validates with Zod schemas and type guards', () => {
      const validTelem = {
        timestamp_ns: 1000,
        robot_state: 'IDLE',
        joint_positions: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
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

  describe('Unit 4.0: Actuation Contracts & Palm State', () => {
    describe('PalmActuatePayload & PalmAction', () => {
      it('validates PalmAction enum values', () => {
        expect(PalmAction.GRASP).toBe('GRASP');
        expect(PalmAction.RELEASE).toBe('RELEASE');
        expect(PalmActionSchema.parse('GRASP')).toBe('GRASP');
        expect(PalmActionSchema.parse('RELEASE')).toBe('RELEASE');
        expect(palmActionSchema).toBe(PalmActionSchema);
        expect(() => PalmActionSchema.parse('SQUEEZE')).toThrow(/Invalid palm action/);
      });

      it('parses valid PalmActuatePayload', () => {
        const parsedGrasp = parsePalmActuatePayload({ action: 'GRASP' });
        expect(parsedGrasp.action).toBe('GRASP');

        const parsedRelease = parsePalmActuatePayload(JSON.stringify({ action: 'RELEASE' }));
        expect(parsedRelease.action).toBe('RELEASE');

        expect(PalmActuatePayloadSchema).toBe(palmActuatePayloadSchema);
      });

      it('rejects malformed PalmActuatePayload', () => {
        expect(() => parsePalmActuatePayload({ action: 'DROP' })).toThrow();
        expect(() => parsePalmActuatePayload({})).toThrow();
        expect(() => parsePalmActuatePayload({ action: 'GRASP', extra: true })).toThrow();
      });
    });

    describe('TrajectoryExecutePayload & PoseName', () => {
      it('validates PoseName enum values', () => {
        expect(PoseName.HOME).toBe('HOME');
        expect(PoseName.READY).toBe('READY');
        expect(PoseName.INSPECT_POSE).toBe('INSPECT_POSE');
        expect(PoseNameSchema.parse('HOME')).toBe('HOME');
        expect(PoseNameSchema.parse('READY')).toBe('READY');
        expect(PoseNameSchema.parse('INSPECT_POSE')).toBe('INSPECT_POSE');
        expect(poseNameSchema).toBe(PoseNameSchema);
        expect(() => PoseNameSchema.parse('DANCE')).toThrow(/Invalid pose name/);
      });

      it('parses valid canned pose TrajectoryExecutePayload', () => {
        const homePayload = parseTrajectoryExecutePayload({ pose_name: 'HOME' });
        expect(homePayload.pose_name).toBe('HOME');

        const readyPayload = parseTrajectoryExecutePayload(JSON.stringify({ pose_name: 'READY' }));
        expect(readyPayload.pose_name).toBe('READY');

        const inspectPayload = parseTrajectoryExecutePayload({ pose_name: 'INSPECT_POSE' });
        expect(inspectPayload.pose_name).toBe('INSPECT_POSE');

        expect(TrajectoryExecutePayloadSchema).toBe(trajectoryExecutePayloadSchema);
      });

      it('parses valid custom waypoints TrajectoryExecutePayload', () => {
        const waypoints = [
          [0.0, -1.57, 1.57, 0.0, 0.0, 0.0] as [number, number, number, number, number, number],
          [0.1, -1.50, 1.60, 0.0, 0.0, 0.0] as [number, number, number, number, number, number],
        ];
        const payload = parseTrajectoryExecutePayload({ waypoints });
        expect(payload.waypoints).toEqual(waypoints);
      });

      it('rejects invalid waypoints with wrong joint count', () => {
        expect(() =>
          parseTrajectoryExecutePayload({
            waypoints: [[0.0, 0.0, 0.0]],
          })
        ).toThrow();
      });
    });

    describe('EmergencyStopPayload & ResetFaultPayload', () => {
      it('parses EmergencyStopPayload with and without reason', () => {
        const withReason = parseEmergencyStopPayload({ reason: 'Collision imminent' });
        expect(withReason.reason).toBe('Collision imminent');

        const withoutReason = parseEmergencyStopPayload({});
        expect(withoutReason.reason).toBeUndefined();

        expect(EmergencyStopPayloadSchema).toBe(emergencyStopPayloadSchema);
      });

      it('parses ResetFaultPayload as strict empty object', () => {
        const reset = parseResetFaultPayload({});
        expect(reset).toEqual({});

        expect(() => parseResetFaultPayload({ unexpected: 'field' })).toThrow();
        expect(ResetFaultPayloadSchema).toBe(resetFaultPayloadSchema);
      });
    });

    describe('PalmState & Telemetry palm_state', () => {
      it('parses valid PalmState', () => {
        const activeState = parsePalmState({ is_grasped: true });
        expect(activeState.is_grasped).toBe(true);

        const inactiveState = parsePalmState(JSON.stringify({ is_grasped: false }));
        expect(inactiveState.is_grasped).toBe(false);

        expect(PalmStateSchema).toBe(palmStateSchema);
      });

      it('parses RobotTelemetryEvent with explicit palm_state', () => {
        const raw = {
          timestamp_ns: '1725894942000000000',
          robot_state: 'IDLE',
          joint_positions: [0.0, -1.57, 1.57, 0.0, 0.0, 0.0],
          palm_state: { is_grasped: true },
        };

        const event = parseRobotTelemetryEvent(JSON.stringify(raw));
        expect(event.palm_state.is_grasped).toBe(true);
      });

      it('defaults palm_state to is_grasped false when omitted', () => {
        const raw = {
          timestamp_ns: '1725894942000000000',
          robot_state: 'IDLE',
          joint_positions: [0.0, -1.57, 1.57, 0.0, 0.0, 0.0],
        };

        const event = parseRobotTelemetryEvent(JSON.stringify(raw));
        expect(event.palm_state).toBeDefined();
        expect(event.palm_state.is_grasped).toBe(false);
      });

      it('rejects non-boolean is_grasped in palm_state', () => {
        const raw = {
          timestamp_ns: '1725894942000000000',
          robot_state: 'IDLE',
          joint_positions: [0.0, -1.57, 1.57, 0.0, 0.0, 0.0],
          palm_state: { is_grasped: 'yes' },
        };

        expect(() => parseRobotTelemetryEvent(JSON.stringify(raw))).toThrow();
      });
    });
  });
});


