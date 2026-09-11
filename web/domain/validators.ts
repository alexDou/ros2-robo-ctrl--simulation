import { z } from 'zod';
import {
  CommandType,
  RobotState,
  UR5E_JOINTS,
  type RobotCommand,
  type RobotTelemetryEvent,
  type ErrorFrame,
} from './contracts';

export const timestampNsSchema = z
  .union([z.bigint(), z.number(), z.string()], {
    message: "Missing required field 'timestamp_ns'",
  })
  .refine(
    (val) => {
      try {
        if (typeof val === 'number' && !Number.isFinite(val)) {
          return false;
        }
        const ts =
          typeof val === 'bigint'
            ? val
            : BigInt(typeof val === 'number' ? Math.floor(val) : String(val));
        return ts >= 0n;
      } catch {
        return false;
      }
    },
    { message: "Field 'timestamp_ns' must be a non-negative integer" }
  );

export const jointPositionsSchema = z
  .array(
    z.unknown().refine(
      (val): val is number => typeof val === 'number' && Number.isFinite(val),
      { message: 'Joint position is not a valid finite number' }
    )
  )
  .refine((arr) => arr.length === UR5E_JOINTS.length, {
    message: `RobotTelemetryEvent must contain exactly ${UR5E_JOINTS.length} joint positions`,
  });

export const inferenceMetricsSchema = z.object({
  latency_ms: z
    .number({ message: "Field 'latency_ms' must be a number" })
    .min(0, { message: "Field 'latency_ms' must be non-negative" }),
  confidence: z
    .number({ message: "Field 'confidence' must be a number" })
    .min(0, { message: "Field 'confidence' must be between 0.0 and 1.0" })
    .max(1, { message: "Field 'confidence' must be between 0.0 and 1.0" }),
  detected_object: z
    .string({ message: "Field 'detected_object' must be a string" })
    .min(1, { message: "Field 'detected_object' must be non-empty" }),
});

export const robotCommandSchema = z.object({
  command_id: z
    .string({ message: "Missing required field 'command_id'" })
    .min(1, { message: "Missing required field 'command_id'" }),
  sender_id: z
    .string({ message: "Missing required field 'sender_id'" })
    .min(1, { message: "Missing required field 'sender_id'" }),
  timestamp_ns: timestampNsSchema,
  type: z.enum(Object.values(CommandType) as [string, ...string[]], {
    message: 'Invalid command type',
  }),
  payload: z.record(z.string(), z.unknown(), {
    message: "Missing or invalid 'payload' object",
  }),
});

export const robotTelemetryEventSchema = z.object({
  timestamp_ns: timestampNsSchema,
  robot_state: z.enum(Object.values(RobotState) as [string, ...string[]], {
    message: 'Invalid robot state',
  }),
  joint_positions: jointPositionsSchema,
  inference_metrics: inferenceMetricsSchema.optional(),
  command_id: z.string().optional(),
});

export const errorFrameSchema = z.object({
  type: z.literal('ERROR', {
    message: "Expected frame type 'ERROR'",
  }),
  error_code: z
    .string({ message: "Missing required field 'error_code'" })
    .min(1, { message: "Missing required field 'error_code'" }),
  message: z
    .string({ message: "Missing required field 'message'" })
    .min(1, { message: "Missing required field 'message'" }),
  timestamp_ns: timestampNsSchema,
});

function safeParseJson(input: unknown): unknown {
  if (typeof input === 'string') {
    try {
      return JSON.parse(input);
    } catch {
      return null;
    }
  }
  return input;
}

export function isRobotCommand(input: unknown): input is RobotCommand {
  const data = safeParseJson(input);
  return robotCommandSchema.safeParse(data).success;
}

export function isRobotTelemetryEvent(input: unknown): input is RobotTelemetryEvent {
  const data = safeParseJson(input);
  return robotTelemetryEventSchema.safeParse(data).success;
}

export function isErrorFrame(input: unknown): input is ErrorFrame {
  const data = safeParseJson(input);
  return errorFrameSchema.safeParse(data).success;
}
