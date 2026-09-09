/**
 * Domain schemas and DataFabric topic contracts for Web Visualizer & TeleopClient.
 */

export const CommandType = {
  PING: 'PING',
  TELEOP_JOINT_TARGET: 'TELEOP_JOINT_TARGET',
  TRAJECTORY_EXECUTE: 'TRAJECTORY_EXECUTE',
  EMERGENCY_STOP: 'EMERGENCY_STOP',
  RESET_FAULT: 'RESET_FAULT',
} as const;

export type CommandType = (typeof CommandType)[keyof typeof CommandType];

export const RobotState = {
  BOOTING: 'BOOTING',
  IDLE: 'IDLE',
  PROCESSING: 'PROCESSING',
  EXECUTING: 'EXECUTING',
  FAULT: 'FAULT',
} as const;

export type RobotState = (typeof RobotState)[keyof typeof RobotState];

export type ArmJointPositions = [number, number, number, number, number, number];

export interface InferenceMetrics {
  latency_ms: number;
  confidence: number;
  detected_object: string;
}

export interface RobotCommand {
  command_id: string;
  sender_id: string;
  timestamp_ns: string | number | bigint;
  type: CommandType;
  payload: Record<string, unknown>;
}

export interface RobotTelemetryEvent {
  timestamp_ns: string | number | bigint;
  robot_state: RobotState;
  joint_positions: ArmJointPositions;
  inference_metrics?: InferenceMetrics;
  command_id?: string;
}

export interface ErrorFrame {
  type: 'ERROR';
  error_code: string;
  message: string;
  timestamp_ns: string | number | bigint;
}

export function createPingCommand(params?: {
  senderId?: string;
  commandId?: string;
  timestampNs?: bigint | number;
}): RobotCommand {
  return {
    command_id: params?.commandId ?? (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `cmd-${Date.now()}`),
    sender_id: params?.senderId ?? 'teleop-ui',
    timestamp_ns: params?.timestampNs ?? BigInt(Date.now()) * 1_000_000n,
    type: CommandType.PING,
    payload: {},
  };
}

function parseJsonIfNeeded(input: string | unknown): unknown {
  if (typeof input === 'string') {
    return JSON.parse(input);
  }
  return input;
}

export function parseRobotCommand(input: string | unknown): RobotCommand {
  const data = parseJsonIfNeeded(input);
  if (!data || typeof data !== 'object') {
    throw new Error('RobotCommand payload must be an object');
  }

  const obj = data as Record<string, unknown>;
  if (typeof obj.command_id !== 'string' || !obj.command_id) {
    throw new Error("Missing required field 'command_id'");
  }
  if (typeof obj.sender_id !== 'string' || !obj.sender_id) {
    throw new Error("Missing required field 'sender_id'");
  }
  if (obj.timestamp_ns === undefined || obj.timestamp_ns === null) {
    throw new Error("Missing required field 'timestamp_ns'");
  }

  const validTypes = Object.values(CommandType) as string[];
  if (typeof obj.type !== 'string' || !validTypes.includes(obj.type)) {
    throw new Error(`Invalid command type: ${String(obj.type)}`);
  }

  if (obj.payload === undefined || obj.payload === null || typeof obj.payload !== 'object' || Array.isArray(obj.payload)) {
    throw new Error("Missing or invalid 'payload' object");
  }

  return {
    command_id: obj.command_id,
    sender_id: obj.sender_id,
    timestamp_ns: obj.timestamp_ns as string | number | bigint,
    type: obj.type as CommandType,
    payload: obj.payload as Record<string, unknown>,
  };
}

export function parseRobotTelemetryEvent(input: string | unknown): RobotTelemetryEvent {
  const data = parseJsonIfNeeded(input);
  if (!data || typeof data !== 'object') {
    throw new Error('RobotTelemetryEvent payload must be an object');
  }

  const obj = data as Record<string, unknown>;
  if (obj.timestamp_ns === undefined || obj.timestamp_ns === null) {
    throw new Error("Missing required field 'timestamp_ns'");
  }

  const validStates = Object.values(RobotState) as string[];
  if (typeof obj.robot_state !== 'string' || !validStates.includes(obj.robot_state)) {
    throw new Error(`Invalid robot state: ${String(obj.robot_state)}`);
  }

  if (!Array.isArray(obj.joint_positions) || obj.joint_positions.length !== 6) {
    throw new Error(
      `RobotTelemetryEvent must contain exactly 6 joint positions, received ${Array.isArray(obj.joint_positions) ? obj.joint_positions.length : 'non-array'}`
    );
  }

  for (let i = 0; i < 6; i++) {
    if (typeof obj.joint_positions[i] !== 'number' || Number.isNaN(obj.joint_positions[i])) {
      throw new Error(`Joint position at index ${i} is not a valid number`);
    }
  }

  let inference_metrics: InferenceMetrics | undefined;
  if (obj.inference_metrics && typeof obj.inference_metrics === 'object') {
    const im = obj.inference_metrics as Record<string, unknown>;
    if (
      typeof im.latency_ms === 'number' &&
      typeof im.confidence === 'number' &&
      typeof im.detected_object === 'string'
    ) {
      inference_metrics = {
        latency_ms: im.latency_ms,
        confidence: im.confidence,
        detected_object: im.detected_object,
      };
    }
  }

  return {
    timestamp_ns: obj.timestamp_ns as string | number | bigint,
    robot_state: obj.robot_state as RobotState,
    joint_positions: obj.joint_positions as ArmJointPositions,
    inference_metrics,
    command_id: typeof obj.command_id === 'string' ? obj.command_id : undefined,
  };
}

export function parseErrorFrame(input: string | unknown): ErrorFrame {
  const data = parseJsonIfNeeded(input);
  if (!data || typeof data !== 'object') {
    throw new Error('ErrorFrame payload must be an object');
  }

  const obj = data as Record<string, unknown>;
  if (obj.type !== 'ERROR') {
    throw new Error(`Expected frame type 'ERROR', got '${String(obj.type)}'`);
  }
  if (typeof obj.error_code !== 'string' || !obj.error_code) {
    throw new Error("Missing required field 'error_code'");
  }
  if (typeof obj.message !== 'string' || !obj.message) {
    throw new Error("Missing required field 'message'");
  }
  if (obj.timestamp_ns === undefined || obj.timestamp_ns === null) {
    throw new Error("Missing required field 'timestamp_ns'");
  }

  return {
    type: 'ERROR',
    error_code: obj.error_code,
    message: obj.message,
    timestamp_ns: obj.timestamp_ns as string | number | bigint,
  };
}

function validateRobotId(robotId: string): void {
  if (!robotId || robotId.includes('/') || robotId.includes('\\') || robotId.includes(' ')) {
    throw new Error(`Invalid robot ID '${robotId}': must be non-empty and not contain slashes or whitespace`);
  }
}

export function robotCommandTopic(robotId: string): string {
  validateRobotId(robotId);
  return `robot/${robotId}/command`;
}

export function robotTelemetryTopic(robotId: string): string {
  validateRobotId(robotId);
  return `robot/${robotId}/telemetry`;
}

export function parseRobotTopic(
  topic: string
): { robotId: string; channel: 'command' | 'telemetry' } | null {
  const parts = topic.split('/');
  if (parts.length !== 3 || parts[0] !== 'robot' || !parts[1]) {
    return null;
  }
  if (parts[2] !== 'command' && parts[2] !== 'telemetry') {
    return null;
  }
  return {
    robotId: parts[1],
    channel: parts[2],
  };
}
