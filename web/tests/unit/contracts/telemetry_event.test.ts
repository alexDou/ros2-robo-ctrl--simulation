import { describe, it, expect } from 'vitest';
import {
  RobotState,
  isRobotTelemetryEvent,
} from '@contracts';
import {
  parseRobotTelemetryEvent,
} from '@domain/parsers';

describe('TypeScript Domain Schemas & Contracts', () => {
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
          spawned: [{ id: 'gear-1', x: 0.5, y: 0.1, z: 0.0, color: 'WHITE', intact: true }],
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
          spawned: [{ id: 'gear-0', x: 0.45, y: 0.1, z: 0.0, color: 'WHITE', intact: true }],
          in_progress: [
            { id: 'gear-1', x: 0.45, y: 0.1, z: 0.0, origin_x: 0.45, origin_y: 0.1, origin_z: 0.0, color: 'GREEN', intact: true },
          ],
          processed: [
            { id: 'gear-2', x: 0.4, y: -0.3, z: 0.02, origin_x: 0.5, origin_y: 0.15, origin_z: 0.0, color: 'BLUE', intact: false },
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
});
