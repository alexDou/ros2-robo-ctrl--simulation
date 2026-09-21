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
  SpawnObjectType,
  SpawnObjectTypeSchema,
  spawnObjectTypeSchema,
  SpawnObjectPayloadSchema,
  spawnObjectPayloadSchema,
  ClearWorkspacePayloadSchema,
  clearWorkspacePayloadSchema,
  PickAndPlaceTargetPayloadSchema,
  pickAndPlaceTargetPayloadSchema,
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
  isSpawnObjectPayload,
  isClearWorkspacePayload,
  isPickAndPlaceTargetPayload,
  type PickAndPlaceTargetPayload,
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
  parseSpawnObjectPayload,
  parseClearWorkspacePayload,
  parsePickAndPlaceTargetPayload,
  robotCommandTopic,
  robotTelemetryTopic,
  parseRobotTopic,
  createPingCommand,
  createSpawnObjectCommand,
  createClearWorkspaceCommand,
  createPickAndPlaceTargetCommand,
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
      workcell_state: { spawned: [], in_progress: [], processed: [] },
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
      workcell_state: { spawned: [], in_progress: [], processed: [] },
      };

      const event = parseRobotTelemetryEvent(JSON.stringify(rawNulls));
      expect(event.robot_state).toBe(RobotState.IDLE);
      expect(event.joint_positions).toHaveLength(6);
      expect(event.inference_metrics).toBeNull();
      expect(event.command_id).toBeNull();
    });

    it('Unit 6.6.7/4ixr: carries optional phase end-to-end, absent stays valid', () => {
      const withPhase = {
        timestamp_ns: '1725894942000000000',
        robot_state: 'EXECUTING',
        joint_positions: [0.0, -1.57, 1.57, 0.0, 0.0, 0.0],
        phase: 'RELEASING',
      workcell_state: { spawned: [], in_progress: [], processed: [] },
      };
      const event = parseRobotTelemetryEvent(JSON.stringify(withPhase));
      expect(event.phase).toBe('RELEASING');

      const legacy = {
        timestamp_ns: '1725894942000000000',
        robot_state: 'IDLE',
        joint_positions: [0.0, -1.57, 1.57, 0.0, 0.0, 0.0],
        workcell_state: { spawned: [], in_progress: [], processed: [] },
      };
      const legacyEvent = parseRobotTelemetryEvent(JSON.stringify(legacy));
      expect(legacyEvent.phase ?? null).toBeNull();
    });

    it('Unit 6.7.0: requires workcell_state with id+coords, rejects legacy-absent', () => {
      const withBucket = {
        timestamp_ns: '1725894942000000000',
        robot_state: 'IDLE',
        joint_positions: [0.0, -1.57, 1.57, 0.0, 0.0, 0.0],
        workcell_state: {
          spawned: [{ id: 'gear-1', x: 0.5, y: 0.1, z: 0.0 }],
          in_progress: [],
          processed: [],
          active_id: 'gear-1',
        },
      };
      const event = parseRobotTelemetryEvent(JSON.stringify(withBucket));
      expect(event.workcell_state.spawned[0].id).toBe('gear-1');
      expect(event.workcell_state.spawned[0].x).toBe(0.5);
      expect(event.workcell_state.active_id).toBe('gear-1');

      const legacyAbsent = {
        timestamp_ns: '1725894942000000000',
        robot_state: 'IDLE',
        joint_positions: [0.0, -1.57, 1.57, 0.0, 0.0, 0.0],
      };
      expect(() => parseRobotTelemetryEvent(JSON.stringify(legacyAbsent))).toThrow();
      expect(isRobotTelemetryEvent(legacyAbsent)).toBe(false);

      const idLess = {
        timestamp_ns: '1725894942000000000',
        robot_state: 'IDLE',
        joint_positions: [0.0, -1.57, 1.57, 0.0, 0.0, 0.0],
        workcell_state: { spawned: [{ x: 0.5, y: 0.1, z: 0.0 }], in_progress: [], processed: [] },
      };
      expect(() => parseRobotTelemetryEvent(JSON.stringify(idLess))).toThrow();
    });

    it('Unit 6.7.4: origin optional on GearEntry, coords verbatim incl origin', () => {
      const withOrigin = {
        timestamp_ns: '1725894942000000000',
        robot_state: 'IDLE',
        joint_positions: [0.0, -1.57, 1.57, 0.0, 0.0, 0.0],
        workcell_state: {
          spawned: [{ id: 'gear-0', x: 0.45, y: 0.1, z: 0.0 }],
          in_progress: [
            { id: 'gear-1', x: 0.45, y: 0.1, z: 0.0, origin_x: 0.45, origin_y: 0.1, origin_z: 0.0 },
          ],
          processed: [
            { id: 'gear-2', x: 0.4, y: -0.3, z: 0.02, origin_x: 0.5, origin_y: 0.15, origin_z: 0.0 },
          ],
          active_id: 'gear-1',
        },
      };
      const event = parseRobotTelemetryEvent(JSON.stringify(withOrigin));
      expect(event.workcell_state.spawned[0].origin_x ?? null).toBeNull();
      expect(event.workcell_state.in_progress[0].origin_x).toBe(0.45);
      expect(event.workcell_state.processed[0].origin_y).toBe(0.15);
      expect(event.workcell_state.active_id).toBe('gear-1');
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
      expect(rawCmdSchema.properties.type.enum).toContain('SPAWN_OBJECT');
      expect(rawCmdSchema.properties.type.enum).toContain('CLEAR_WORKSPACE');
      expect(rawCmdSchema.properties.type.enum).toContain('PICK_AND_PLACE_TARGET');
      expect(rawCmdSchema.$defs.spawn_object_payload).toBeDefined();
      expect(rawCmdSchema.$defs.clear_workspace_payload).toBeDefined();
      expect(rawCmdSchema.$defs.pick_and_place_target_payload).toBeDefined();

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
          workcell_state: { spawned: [], in_progress: [], processed: [] },
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
          workcell_state: { spawned: [], in_progress: [], processed: [] },
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


