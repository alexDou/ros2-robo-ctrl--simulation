import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { isBrowser } from '@utils/env';
import {
  isErrorFrame,
  PalmAction,
  PoseName,
  type RobotTelemetryEvent,
  type ErrorFrame,
  type RobotState,
  type SpawnObjectPayload,
} from '@contracts';
import {
  createPingCommand,
  createTrajectoryExecuteCommand,
  createPalmActuateCommand,
  createEmergencyStopCommand,
  createResetFaultCommand,
  createPickAndPlaceTargetCommand,
  createSpawnObjectCommand,
  createClearWorkspaceCommand,
  serializeCommand,
  isActionFeedbackFrame,
  type PickAndPlaceTargetPayload,
} from '@domain/parsers';

export type ConnectionState = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'CONFLICT';

export interface TelemetryLogEntry {
  id: string;
  type: 'telemetry';
  timestamp: string;
  data: RobotTelemetryEvent;
}

export interface ErrorLogEntry {
  id: string;
  type: 'error';
  timestamp: string;
  data: ErrorFrame;
}

export type LogEntry = TelemetryLogEntry | ErrorLogEntry;

export interface ActionProgress {
  phase: string;
  percentComplete: number;
  commandId?: string;
}

export interface ErrorBannerInfo {
  errorCode: string;
  message: string;
}

export interface UseTeleopSessionOptions {
  wsUrl: string;
  handleIncomingFrame: (data: unknown) => boolean;
  resetStream: () => void;
  robotState?: RobotState | string | null;
  palmState?: { is_grasped: boolean };
}

export function useTeleopSession({
  wsUrl,
  handleIncomingFrame,
  resetStream,
  robotState,
  palmState,
}: UseTeleopSessionOptions) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('CONNECTING');
  const [conflictReason, setConflictReason] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [hasActiveGear, setHasActiveGear] = useState(false);
  const [actionProgress, setActionProgress] = useState<ActionProgress | null>(null);
  const [errorBanner, setErrorBanner] = useState<ErrorBannerInfo | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const isCleaningUp = useRef(false);
  const lastLoggedStateRef = useRef<string | null>(null);
  const prevRobotStateRef = useRef<string | null>(null);
  const errorBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const current = robotState ?? 'IDLE';
    const prev = prevRobotStateRef.current;
    if (prev === 'EXECUTING' && current === 'IDLE') {
      setHasActiveGear(false);
    }
    prevRobotStateRef.current = current;
  }, [robotState]);

  const connect = useCallback(() => {
    isCleaningUp.current = false;
    lastLoggedStateRef.current = null;
    setConnectionState('CONNECTING');
    setConflictReason(null);
    setActionProgress(null);
    resetStream();

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    if (isBrowser()) {
      window.__teleop_ws = ws;
    }

    ws.onopen = () => {
      if (isCleaningUp.current) return;
      setConnectionState('CONNECTED');
      setConflictReason(null);
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(event.data);

        const handled = handleIncomingFrame(parsed);
        if (handled) {
          const telem = parsed as RobotTelemetryEvent;
          const isFirst = lastLoggedStateRef.current === null;
          const stateChanged = lastLoggedStateRef.current !== telem.robot_state;
          if (telem.robot_state === 'FAULT') {
            setActionProgress(null);
          }
          if (telem.command_id || isFirst || stateChanged) {
            lastLoggedStateRef.current = telem.robot_state;
            const entry: LogEntry = {
              id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              type: 'telemetry',
              timestamp: new Date().toLocaleTimeString(),
              data: telem,
            };
            setLogs((prev) => [entry, ...prev].slice(0, 100));
          }
        } else if (isActionFeedbackFrame(parsed)) {
          setActionProgress({
            phase: parsed.phase,
            percentComplete: parsed.percent_complete,
            commandId: parsed.command_id,
          });
        } else if (isErrorFrame(parsed)) {
          setActionProgress(null);
          if (errorBannerTimerRef.current) {
            clearTimeout(errorBannerTimerRef.current);
          }
          setErrorBanner({ errorCode: parsed.error_code, message: parsed.message });
          errorBannerTimerRef.current = setTimeout(() => {
            setErrorBanner(null);
            errorBannerTimerRef.current = null;
          }, 2000);

          const entry: LogEntry = {
            id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            type: 'error',
            timestamp: new Date().toLocaleTimeString(),
            data: parsed,
          };
          setLogs((prev) => [entry, ...prev].slice(0, 100));
        }
      } catch {
        // Discard unparseable or corrupted socket frame
      }
    };

    ws.onerror = async () => {
      // Check for 409 Conflict using HTTP probe
      const httpUrl = wsUrl.replace(/^ws(s)?:/, 'http$1:');
      try {
        const res = await fetch(httpUrl);
        if (res.status === 409) {
          const txt = await res.text();
          setConnectionState('CONFLICT');
          setConflictReason(txt || 'Active session already exists for robot');
          return;
        }
      } catch {
        // Network failure handled by close event
      }
    };

    ws.onclose = (event: CloseEvent) => {
      if (isCleaningUp.current) return;
      resetStream();
      if (event.code === 4409 || event.reason === 'Conflict') {
        setConnectionState('CONFLICT');
        setConflictReason('Active session already exists for robot');
      } else {
        setConnectionState((curr) => (curr === 'CONFLICT' ? 'CONFLICT' : 'DISCONNECTED'));
      }
    };
  }, [wsUrl, handleIncomingFrame, resetStream]);

  useEffect(() => {
    connect();
    return () => {
      isCleaningUp.current = true;
      if (errorBannerTimerRef.current) {
        clearTimeout(errorBannerTimerRef.current);
      }
      if (isBrowser()) {
        delete window.__teleop_ws;
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  const executePose = useCallback((poseName: PoseName) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const cmd = createTrajectoryExecuteCommand(poseName, { senderId: 'ui-client' });
    wsRef.current.send(serializeCommand(cmd));
  }, []);

  const togglePalm = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const action = palmState?.is_grasped ? PalmAction.RELEASE : PalmAction.GRASP;
    const cmd = createPalmActuateCommand(action, { senderId: 'ui-client' });
    wsRef.current.send(serializeCommand(cmd));
  }, [palmState?.is_grasped]);

  const emergencyStop = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    setActionProgress(null);
    const cmd = createEmergencyStopCommand({
      reason: 'Operator toolbar emergency stop triggered',
      senderId: 'ui-client',
    });
    wsRef.current.send(serializeCommand(cmd));
  }, []);

  const resetFault = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    setActionProgress(null);
    const cmd = createResetFaultCommand({ senderId: 'ui-client' });
    wsRef.current.send(serializeCommand(cmd));
  }, []);

  const pickAndPlaceTarget = useCallback(
    (payload: PickAndPlaceTargetPayload) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      const currentRobotState = robotState ?? 'IDLE';
      if (currentRobotState !== 'IDLE') return;
      setActionProgress(null);
      const cmd = createPickAndPlaceTargetCommand(payload, { senderId: 'ui-client' });
      wsRef.current.send(serializeCommand(cmd));
      setHasActiveGear(true);
    },
    [robotState]
  );

  const spawnObject = useCallback(
    (payload: SpawnObjectPayload) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      const currentRobotState = robotState ?? 'IDLE';
      if (currentRobotState !== 'IDLE') return;
      const cmd = createSpawnObjectCommand(payload, { senderId: 'ui-client' });
      wsRef.current.send(serializeCommand(cmd));
      setHasActiveGear(true);
    },
    [robotState]
  );

  const clearWorkspace = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const currentRobotState = robotState ?? 'IDLE';
    if (currentRobotState !== 'IDLE') return;
    const hasVisualizerGears =
      typeof window !== 'undefined' &&
      window.__robot_visualizer &&
      ((window.__robot_visualizer.getTowerGearCount?.() ?? 0) > 0 ||
        window.__robot_visualizer.hasActiveGear?.());
    if (!hasActiveGear && !hasVisualizerGears) return;
    setActionProgress(null);
    const cmd = createClearWorkspaceCommand({ senderId: 'ui-client' });
    wsRef.current.send(serializeCommand(cmd));
    setHasActiveGear(false);
    if (typeof window !== 'undefined' && window.__robot_visualizer?.clearWorkspace) {
      window.__robot_visualizer.clearWorkspace();
    }
  }, [robotState, hasActiveGear]);

  const sendPing = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const pingCmd = createPingCommand({ senderId: 'ui-client' });
    wsRef.current.send(serializeCommand(pingCmd));
  }, []);

  return {
    connectionState,
    conflictReason,
    logs,
    hasActiveGear,
    actionProgress,
    errorBanner,
    connect,
    executePose,
    togglePalm,
    emergencyStop,
    resetFault,
    pickAndPlaceTarget,
    spawnObject,
    clearWorkspace,
    sendPing,
  };
}
