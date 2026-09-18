import { useRef, useState, useCallback } from 'preact/hooks';
import {
  isRobotTelemetryEvent,
  CANONICAL_POSES,
  type ArmJointPositions,
  type RobotState,
} from '@contracts';

export interface TelemetryBuffer {
  jointPositions: ArmJointPositions;
  timestampNs: string | bigint | number;
  robotState: RobotState;
  palmState?: { is_grasped: boolean };
  frequencyHz: number;
  latencyMs: number;
  lastPacketTime: number;
  frameCount: number;
}

export function useTelemetryStream() {
  const bufferRef = useRef<TelemetryBuffer>({
    jointPositions: [...CANONICAL_POSES.HOME],
    timestampNs: 0n.toString(),
    robotState: 'IDLE' as RobotState,
    palmState: { is_grasped: false },
    frequencyHz: 0,
    latencyMs: 0,
    lastPacketTime: 0,
    frameCount: 0,
  });

  const [isStreaming, setIsStreaming] = useState(false);
  const [robotState, setRobotState] = useState<RobotState | null>(null);
  const [palmState, setPalmState] = useState<{ is_grasped: boolean }>({ is_grasped: false });
  const frameTimestampsRef = useRef<number[]>([]);
  const lastStreamingRef = useRef(false);
  const lastRobotStateRef = useRef<RobotState | null>(null);
  const lastPalmGraspedRef = useRef<boolean | null>(null);

  const handleIncomingFrame = useCallback((data: unknown): boolean => {
    if (!isRobotTelemetryEvent(data)) {
      return false;
    }

    const now = performance.now();
    const buf = bufferRef.current;
    buf.jointPositions = data.joint_positions;
    buf.robotState = data.robot_state;
    buf.palmState = data.palm_state;
    buf.timestampNs = data.timestamp_ns;
    buf.lastPacketTime = now;
    buf.frameCount++;

    if (data.palm_state && lastPalmGraspedRef.current !== data.palm_state.is_grasped) {
      lastPalmGraspedRef.current = data.palm_state.is_grasped;
      setPalmState(data.palm_state);
    }

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
    if (!lastStreamingRef.current) {
      lastStreamingRef.current = true;
      setIsStreaming(true);
    }

    if (lastRobotStateRef.current !== data.robot_state) {
      lastRobotStateRef.current = data.robot_state;
      setRobotState(data.robot_state);
    }

    return true;
  }, []);

  const resetStream = useCallback(() => {
    lastStreamingRef.current = false;
    lastRobotStateRef.current = null;
    lastPalmGraspedRef.current = null;
    setIsStreaming(false);
    setRobotState(null);
    setPalmState({ is_grasped: false });
    frameTimestampsRef.current = [];
    bufferRef.current = {
      jointPositions: [...CANONICAL_POSES.HOME],
      timestampNs: 0n.toString(),
      robotState: 'IDLE' as RobotState,
      palmState: { is_grasped: false },
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
    palmState,
    handleIncomingFrame,
    resetStream,
  };
}

