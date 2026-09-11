import {
  robotCommandSchema,
  robotTelemetryEventSchema,
  errorFrameSchema,
  robotIdSchema,
  robotTopicSchema,
} from './validators';
import {
  CommandType,
  type RobotCommand,
  type RobotTelemetryEvent,
  type ErrorFrame,
} from './contracts';

function unwrapZod<T>(result: {
  success: true;
  data: unknown;
} | {
  success: false;
  error: { issues: Array<{ message: string }> };
}): T {
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? 'Validation failed');
  }
  return result.data as T;
}

export function parseRobotCommand(input: unknown): RobotCommand {
  return unwrapZod<RobotCommand>(robotCommandSchema.safeParse(input));
}

export function parseRobotTelemetryEvent(input: unknown): RobotTelemetryEvent {
  return unwrapZod<RobotTelemetryEvent>(robotTelemetryEventSchema.safeParse(input));
}

export function parseErrorFrame(input: unknown): ErrorFrame {
  return unwrapZod<ErrorFrame>(errorFrameSchema.safeParse(input));
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

export function robotCommandTopic(robotId: string): string {
  const validId = robotIdSchema.parse(robotId);
  return `robot/${validId}/command`;
}

export function robotTelemetryTopic(robotId: string): string {
  const validId = robotIdSchema.parse(robotId);
  return `robot/${validId}/telemetry`;
}

export function parseRobotTopic(
  topic: string
): { robotId: string; channel: 'command' | 'telemetry' } | null {
  const result = robotTopicSchema.safeParse(topic);
  return result.success ? result.data : null;
}
