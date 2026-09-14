export * from './contracts';
import {
  CommandType,
  type RobotCommand,
  type PoseName,
  type PalmAction,
} from './contracts';

function generateCommandId(commandId?: string): string {
  if (commandId) return commandId;
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `cmd-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
}

function getTimestampNs(timestampNs?: bigint | number): bigint | number {
  return timestampNs ?? BigInt(Date.now()) * 1_000_000n;
}

export function createPingCommand(params?: {
  senderId?: string;
  commandId?: string;
  timestampNs?: bigint | number;
}): RobotCommand {
  return {
    command_id: generateCommandId(params?.commandId),
    sender_id: params?.senderId ?? 'teleop-ui',
    timestamp_ns: getTimestampNs(params?.timestampNs),
    type: CommandType.PING,
    payload: {},
  };
}

export function createTrajectoryExecuteCommand(
  poseName: PoseName,
  params?: {
    senderId?: string;
    commandId?: string;
    timestampNs?: bigint | number;
  }
): RobotCommand {
  return {
    command_id: generateCommandId(params?.commandId),
    sender_id: params?.senderId ?? 'teleop-ui',
    timestamp_ns: getTimestampNs(params?.timestampNs),
    type: CommandType.TRAJECTORY_EXECUTE,
    payload: { pose_name: poseName },
  };
}

export function createPalmActuateCommand(
  action: PalmAction,
  params?: {
    senderId?: string;
    commandId?: string;
    timestampNs?: bigint | number;
  }
): RobotCommand {
  return {
    command_id: generateCommandId(params?.commandId),
    sender_id: params?.senderId ?? 'teleop-ui',
    timestamp_ns: getTimestampNs(params?.timestampNs),
    type: CommandType.PALM_ACTUATE,
    payload: { action },
  };
}

export function createEmergencyStopCommand(params?: {
  reason?: string;
  senderId?: string;
  commandId?: string;
  timestampNs?: bigint | number;
}): RobotCommand {
  return {
    command_id: generateCommandId(params?.commandId),
    sender_id: params?.senderId ?? 'teleop-ui',
    timestamp_ns: getTimestampNs(params?.timestampNs),
    type: CommandType.EMERGENCY_STOP,
    payload: params?.reason ? { reason: params.reason } : {},
  };
}

export function createResetFaultCommand(params?: {
  senderId?: string;
  commandId?: string;
  timestampNs?: bigint | number;
}): RobotCommand {
  return {
    command_id: generateCommandId(params?.commandId),
    sender_id: params?.senderId ?? 'teleop-ui',
    timestamp_ns: getTimestampNs(params?.timestampNs),
    type: CommandType.RESET_FAULT,
    payload: {},
  };
}

