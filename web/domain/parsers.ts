export * from './contracts';
import {
  CommandType,
  type RobotCommand,
  type PoseName,
  type PalmAction,
  type SpawnObjectPayload,
  type PickAndPlaceTargetPayload,
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

export function createSpawnObjectCommand(
  payload: SpawnObjectPayload,
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
    type: CommandType.SPAWN_OBJECT,
    payload,
  };
}

export function createClearWorkspaceCommand(params?: {
  senderId?: string;
  commandId?: string;
  timestampNs?: bigint | number;
}): RobotCommand {
  return {
    command_id: generateCommandId(params?.commandId),
    sender_id: params?.senderId ?? 'teleop-ui',
    timestamp_ns: getTimestampNs(params?.timestampNs),
    type: CommandType.CLEAR_WORKSPACE,
    payload: {},
  };
}

export function createPickAndPlaceTargetCommand(
  payload: PickAndPlaceTargetPayload,
  params?: {
    senderId?: string;
    commandId?: string;
    timestampNs?: bigint | number;
  }
): RobotCommand;
export function createPickAndPlaceTargetCommand(
  pick: { x: number; y: number; z: number },
  params?: {
    senderId?: string;
    commandId?: string;
    timestampNs?: bigint | number;
  }
): RobotCommand;
export function createPickAndPlaceTargetCommand(
  pick: { x: number; y: number; z: number },
  drop?: { x?: number; y?: number; z?: number },
  params?: {
    senderId?: string;
    commandId?: string;
    timestampNs?: bigint | number;
  }
): RobotCommand;
export function createPickAndPlaceTargetCommand(
  pickOrPayload: { x: number; y: number; z: number } | PickAndPlaceTargetPayload,
  dropOrParams?:
    | { x?: number; y?: number; z?: number }
    | {
        senderId?: string;
        commandId?: string;
        timestampNs?: bigint | number;
      },
  params?: {
    senderId?: string;
    commandId?: string;
    timestampNs?: bigint | number;
  }
): RobotCommand {
  let payload: PickAndPlaceTargetPayload;
  let options: { senderId?: string; commandId?: string; timestampNs?: bigint | number } | undefined;

  if ('pick_x' in pickOrPayload) {
    payload = pickOrPayload;
    options = dropOrParams as typeof options;
  } else {
    const isOptions = (val: unknown): val is typeof options =>
      Boolean(
        val &&
          typeof val === 'object' &&
          ('senderId' in val || 'commandId' in val || 'timestampNs' in val)
      );

    let drop: { x?: number; y?: number; z?: number } | undefined;
    if (isOptions(dropOrParams)) {
      options = dropOrParams;
    } else {
      drop = dropOrParams;
      options = params;
    }

    payload = {
      pick_x: pickOrPayload.x,
      pick_y: pickOrPayload.y,
      pick_z: pickOrPayload.z,
      ...(drop?.x !== undefined ? { drop_x: drop.x } : {}),
      ...(drop?.y !== undefined ? { drop_y: drop.y } : {}),
      ...(drop?.z !== undefined ? { drop_z: drop.z } : {}),
    };
  }

  return {
    command_id: generateCommandId(options?.commandId),
    sender_id: options?.senderId ?? 'teleop-ui',
    timestamp_ns: getTimestampNs(options?.timestampNs),
    type: CommandType.PICK_AND_PLACE_TARGET,
    payload,
  };
}

export interface ActionFeedbackFrame {
  type: 'ACTION_FEEDBACK';
  command_id: string;
  phase: string;
  percent_complete: number;
  timestamp_ns: string | number | bigint;
}

export function isActionFeedbackFrame(data: unknown): data is ActionFeedbackFrame {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    d.type === 'ACTION_FEEDBACK' &&
    typeof d.command_id === 'string' &&
    typeof d.phase === 'string' &&
    typeof d.percent_complete === 'number'
  );
}
