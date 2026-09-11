import {
  robotCommandSchema,
  robotTelemetryEventSchema,
  errorFrameSchema,
} from './validators';
import {
  CommandType,
  type RobotCommand,
  type RobotTelemetryEvent,
  type ErrorFrame,
} from './contracts';

export function parseJsonIfNeeded(input: string | unknown): unknown {
  if (typeof input === 'string') {
    return JSON.parse(input);
  }
  return input;
}

function unwrapZod<T>(result: { success: true; data: unknown } | { success: false; error: { issues: Array<{ message: string }> } }): T {
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? 'Validation failed');
  }
  return result.data as T;
}

export function parseRobotCommand(input: string | unknown): RobotCommand {
  const data = parseJsonIfNeeded(input);
  if (!data || typeof data !== 'object') {
    throw new Error('RobotCommand payload must be an object');
  }
  return unwrapZod<RobotCommand>(robotCommandSchema.safeParse(data));
}

export function parseRobotTelemetryEvent(input: string | unknown): RobotTelemetryEvent {
  const data = parseJsonIfNeeded(input);
  if (!data || typeof data !== 'object') {
    throw new Error('RobotTelemetryEvent payload must be an object');
  }
  return unwrapZod<RobotTelemetryEvent>(robotTelemetryEventSchema.safeParse(data));
}

export function parseErrorFrame(input: string | unknown): ErrorFrame {
  const data = parseJsonIfNeeded(input);
  if (!data || typeof data !== 'object') {
    throw new Error('ErrorFrame payload must be an object');
  }
  return unwrapZod<ErrorFrame>(errorFrameSchema.safeParse(data));
}

export function createPingCommand(params?: {
  senderId?: string;
  commandId?: string;
  timestampNs?: bigint | number;
}): RobotCommand {
  return {
    command_id:
      params?.commandId ??
      (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `cmd-${Date.now()}`),
    sender_id: params?.senderId ?? 'teleop-ui',
    timestamp_ns: params?.timestampNs ?? BigInt(Date.now()) * 1_000_000n,
    type: CommandType.PING,
    payload: {},
  };
}

export function serializeCommand(cmd: RobotCommand): string {
  return JSON.stringify(cmd, (_, v) =>
    typeof v === 'bigint' ? Number(v) : v
  );
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
    channel: parts[2] as 'command' | 'telemetry',
  };
}
