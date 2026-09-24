import { useRef, useState, useCallback } from 'preact/hooks';
import {
  isRobotTelemetryEvent,
  CANONICAL_POSES,
  type ArmJointPositions,
  type RobotState,
  type GearEntry,
} from '@contracts';

export interface WorkcellSnapshot {
  spawned: GearEntry[];
  inProgress: GearEntry[];
  processed: GearEntry[];
  activeId: string | null;
}

export interface TelemetryBuffer {
  jointPositions: ArmJointPositions;
  timestampNs: string | bigint | number;
  robotState: RobotState;
  palmState?: { is_grasped: boolean };
  inferenceMetrics?: { latency_ms: number; confidence: number; detected_object: string } | null;
  phase?: string | null;
  workcellState: WorkcellSnapshot;
  frequencyHz: number;
  latencyMs: number;
  lastPacketTime: number;
  frameCount: number;
}

const EMPTY_WORKCELL: WorkcellSnapshot = {
  spawned: [],
  inProgress: [],
  processed: [],
  activeId: null,
};

function toSnapshot(ws: unknown): WorkcellSnapshot {
  if (!ws || typeof ws !== 'object') return { ...EMPTY_WORKCELL };
  const w = ws as {
    spawned?: unknown;
    in_progress?: unknown;
    processed?: unknown;
    active_id?: unknown;
  };
  const list = (v: unknown): GearEntry[] => (Array.isArray(v) ? (v as GearEntry[]) : []);
  return {
    spawned: list(w.spawned),
    inProgress: list(w.in_progress),
    processed: list(w.processed),
    activeId: typeof w.active_id === 'string' ? w.active_id : null,
  };
}

export function useTelemetryStream() {
  const bufferRef = useRef<TelemetryBuffer>({
    jointPositions: [...CANONICAL_POSES.HOME],
    timestampNs: 0n.toString(),
    robotState: 'STANDBY' as RobotState,
    palmState: { is_grasped: false },
    phase: null,
    workcellState: { ...EMPTY_WORKCELL },
    frequencyHz: 0,
    latencyMs: 0,
    lastPacketTime: 0,
    frameCount: 0,
  });

  const [isStreaming, setIsStreaming] = useState(false);
  const [robotState, setRobotState] = useState<RobotState | null>('STANDBY');
  const [palmState, setPalmState] = useState<{ is_grasped: boolean }>({ is_grasped: false });
  // Bumped when workcell snapshot signature changes so consumers deriving
  // UI state from bufferRef.current.workcellState (e.g. Clear button)
  // re-render. Buffer mutation alone triggers no render.
  const [workcellVersion, setWorkcellVersion] = useState(0);
  const lastWorkcellSigRef = useRef<string>('');
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
    buf.inferenceMetrics = data.inference_metrics ?? null;
    buf.phase = data.phase ?? null;
    buf.workcellState = toSnapshot(data.workcell_state);
    const sig = `${buf.workcellState.spawned.length}:${buf.workcellState.inProgress.length}:${buf.workcellState.processed.length}:${buf.workcellState.activeId ?? ''}`;
    if (sig !== lastWorkcellSigRef.current) {
      lastWorkcellSigRef.current = sig;
      setWorkcellVersion((v) => v + 1);
    }
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
    lastRobotStateRef.current = 'STANDBY';
    lastPalmGraspedRef.current = null;
    lastWorkcellSigRef.current = '';
    setIsStreaming(false);
    setRobotState('STANDBY');
    setPalmState({ is_grasped: false });
    setWorkcellVersion((v) => v + 1);
    frameTimestampsRef.current = [];
    bufferRef.current = {
      jointPositions: [...CANONICAL_POSES.HOME],
      timestampNs: 0n.toString(),
      robotState: 'STANDBY' as RobotState,
      palmState: { is_grasped: false },
      phase: null,
      workcellState: { ...EMPTY_WORKCELL },
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
    workcellVersion,
    handleIncomingFrame,
    resetStream,
  };
}

