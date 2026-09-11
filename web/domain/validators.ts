import { z } from 'zod';
import {
  CommandType,
  RobotState,
  UR5E_JOINTS,
  type RobotCommand,
  type RobotTelemetryEvent,
  type ErrorFrame,
} from './contracts';

const jsonInput = z.unknown().transform((val, ctx) => {
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Payload must be valid JSON' });
      return z.NEVER;
    }
  }
  return val;
});

const timestampNsSchema = z
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

const jointPositionsSchema = z
  .array(
    z.unknown().refine(
      (val): val is number => typeof val === 'number' && Number.isFinite(val),
      { message: 'Joint position is not a valid finite number' }
    )
  )
  .refine((arr) => arr.length === UR5E_JOINTS.length, {
    message: `RobotTelemetryEvent must contain exactly ${UR5E_JOINTS.length} joint positions`,
  });

const inferenceMetricsSchema = z.object({
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

export const robotCommandSchema = jsonInput.pipe(
  z.object(
    {
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
    },
    { message: 'RobotCommand payload must be an object' }
  )
);

export const robotTelemetryEventSchema = jsonInput.pipe(
  z.object(
    {
      timestamp_ns: timestampNsSchema,
      robot_state: z.enum(Object.values(RobotState) as [string, ...string[]], {
        message: 'Invalid robot state',
      }),
      joint_positions: jointPositionsSchema,
      inference_metrics: inferenceMetricsSchema.optional(),
      command_id: z.string().optional(),
    },
    { message: 'RobotTelemetryEvent payload must be an object' }
  )
);

export const errorFrameSchema = jsonInput.pipe(
  z.object(
    {
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
    },
    { message: 'ErrorFrame payload must be an object' }
  )
);

export const robotIdSchema = z
  .string({
    message:
      'Invalid robot ID: must be non-empty and not contain slashes or whitespace',
  })
  .min(1, {
    message:
      'Invalid robot ID: must be non-empty and not contain slashes or whitespace',
  })
  .regex(/^[^/\\\s]+$/, {
    message:
      'Invalid robot ID: must be non-empty and not contain slashes or whitespace',
  });

export const robotTopicSchema = z
  .string()
  .regex(/^robot\/([^/\\\s]+)\/(command|telemetry)$/)
  .transform((topic) => {
    const parts = topic.split('/');
    return {
      robotId: parts[1],
      channel: parts[2] as 'command' | 'telemetry',
    };
  });

export function isRobotCommand(input: unknown): input is RobotCommand {
  return robotCommandSchema.safeParse(input).success;
}

export function isRobotTelemetryEvent(
  input: unknown
): input is RobotTelemetryEvent {
  return robotTelemetryEventSchema.safeParse(input).success;
}

export function isErrorFrame(input: unknown): input is ErrorFrame {
  return errorFrameSchema.safeParse(input).success;
}
