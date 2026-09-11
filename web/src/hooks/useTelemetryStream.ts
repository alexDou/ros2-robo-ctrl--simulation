import { useRef, useState, useCallback } from 'preact/hooks';
import {
  isRobotTelemetryEvent,
  type ArmJointPositions,
  type RobotState,
} from '@contracts';

export interface TelemetryBuffer {
  jointPositions: ArmJointPositions;
  timestampNs: string | bigint | number;
  robotState: RobotState;
  frequencyHz: number;
  latencyMs: number;
  lastPacketTime: number;
  frameCount: number;
}

export function useTelemetryStream() {
  const bufferRef = useRef<TelemetryBuffer>({
    jointPositions: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    timestampNs: 0n.toString(),
    robotState: 'IDLE' as RobotState,
    frequencyHz: 0,
    latencyMs: 0,
    lastPacketTime: 0,
    frameCount: 0,
  });

  const [isStreaming, setIsStreaming] = useState(false);
  const [robotState, setRobotState] = useState<RobotState | null>(null);
  const frameTimestampsRef = useRef<number[]>([]);

  const handleIncomingFrame = useCallback((data: unknown): boolean => {
    if (!isRobotTelemetryEvent(data)) {
      return false;
    }

    const now = performance.now();
    const buf = bufferRef.current;
    buf.jointPositions = data.joint_positions;
    buf.robotState = data.robot_state;
    buf.timestampNs = data.timestamp_ns;
    buf.lastPacketTime = now;
    buf.frameCount++;

    // Calculate latency from timestamp_ns if available
    try {
      const tsNs =
        typeof data.timestamp_ns === 'bigint'
          ? data.timestamp_ns
          : BigInt(String(data.timestamp_ns));
      const packetMs = Number(tsNs / 1_000_000n);
      const latency = Math.max(0, Date.now() - packetMs);
      buf.latencyMs = latency;
    } catch {
      buf.latencyMs = 0;
    }

    // Rolling 1-second frequency calculation
    const timestamps = frameTimestampsRef.current;
    timestamps.push(now);
    const windowStart = now - 1000;
    while (timestamps.length > 0 && timestamps[0] < windowStart) {
      timestamps.shift();
    }
    buf.frequencyHz = timestamps.length;

    // Transition reactive state on initial stream detection or state changes
    setIsStreaming((prev) => {
      if (!prev) return true;
      return prev;
    });

    setRobotState((prev) => {
      if (prev !== data.robot_state) {
        return data.robot_state;
      }
      return prev;
    });

    return true;
  }, []);

  const resetStream = useCallback(() => {
    setIsStreaming(false);
    setRobotState(null);
    frameTimestampsRef.current = [];
    bufferRef.current = {
      jointPositions: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
      timestampNs: 0n.toString(),
      robotState: 'IDLE' as RobotState,
      frequencyHz: 0,
      latencyMs: 0,
      lastPacketTime: 0,
      frameCount: 0,
    };
  }, []);

  return {
    bufferRef,
    isStreaming,
    robotState,
    handleIncomingFrame,
    resetStream,
  };
}
