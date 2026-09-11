export * from './contracts';
import { CommandType, type RobotCommand } from './contracts';

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
