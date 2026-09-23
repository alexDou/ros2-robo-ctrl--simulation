import { describe, it, expect } from 'vitest';
import {
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
} from '@contracts';
import {
  parseRobotTelemetryEvent,
  parsePalmActuatePayload,
  parseTrajectoryExecutePayload,
  parseEmergencyStopPayload,
  parseResetFaultPayload,
  parsePalmState,
} from '@domain/parsers';

describe('TypeScript Domain Schemas & Contracts', () => {
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
});
