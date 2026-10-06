import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { isBrowser } from '@utils/env';
import { resolveGatewayHealthUrl } from '@utils/url';
import {
  isErrorFrame,
  PalmAction,
  PoseName,
  type RobotTelemetryEvent,
  type ErrorFrame,
  type RobotState,
} from '@contracts';
import {
  createPingCommand,
  createTrajectoryExecuteCommand,
  createPalmActuateCommand,
  createEmergencyStopCommand,
  createResetFaultCommand,
  createCellFillCommand,
  createCellProcessCommand,
  createCellStopCommand,
  createClearWorkspaceCommand,
  serializeCommand,
  isActionFeedbackFrame,
} from '@domain/parsers';

/** Close reason the Gateway sends when an EmergencyStop ends the session (D31). */
const EMERGENCY_STOP_CLOSE_REASON = 'EMERGENCY_STOP';

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

export interface ProbeLogEntry {
  id: string;
  type: 'probe';
  timestamp: string;
  data: { status: string; detail: string };
}

export type LogEntry = TelemetryLogEntry | ErrorLogEntry | ProbeLogEntry;

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
  const [connectionState, setConnectionState] = useState<ConnectionState>('DISCONNECTED');
  const [conflictReason, setConflictReason] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [actionProgress, setActionProgress] = useState<ActionProgress | null>(null);
  const [errorBanner, setErrorBanner] = useState<ErrorBannerInfo | null>(null);
  const [hasEverConnected, setHasEverConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const isCleaningUp = useRef(false);
  const lastLoggedStateRef = useRef<string | null>(null);
  const prevRobotStateRef = useRef<string | null>(null);
  const errorBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const current = robotState ?? 'STANDBY';
    const prev = prevRobotStateRef.current;
    if (prev === 'EXECUTING' && current === 'IDLE') {
      // Workcell-authority: gear truth lives in snapshot buckets, not the
      // session flag. Cycle end always clears the flag; Clear button state
      // derives from snapshot (see TeleopClient workcellHasGears).
    }
    prevRobotStateRef.current = current;
  }, [robotState]);

  const flashErrorBanner = useCallback((errorCode: string, message: string) => {
    if (errorBannerTimerRef.current) {
      clearTimeout(errorBannerTimerRef.current);
    }
    setErrorBanner({ errorCode, message });
    errorBannerTimerRef.current = setTimeout(() => {
      setErrorBanner(null);
      errorBannerTimerRef.current = null;
    }, 2000);
  }, []);

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
      // Reload/reconnect = system reset (Q29): the edge may still hold a previous session's gears.
      ws.send(serializeCommand(createClearWorkspaceCommand({ senderId: 'ui-client' })));
      setHasEverConnected(true);
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
          flashErrorBanner(parsed.error_code, parsed.message);

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
        if (event.reason === EMERGENCY_STOP_CLOSE_REASON) {
          // D31: the Gateway ends the session; Connect again runs the flush reset.
          flashErrorBanner(
            'EMERGENCY_STOP',
            'Session ended by EmergencyStop. Connect to reset the cell.',
          );
        }
      }
    };
  }, [wsUrl, handleIncomingFrame, resetStream, flashErrorBanner]);

  useEffect(() => {
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
  }, []);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (isBrowser()) {
      delete window.__teleop_ws;
    }
    resetStream();
    setConnectionState('DISCONNECTED');
  }, [resetStream]);

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

  const cellFill = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(serializeCommand(createCellFillCommand({ senderId: 'ui-client' })));
  }, []);

  const cellProcess = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(serializeCommand(createCellProcessCommand({ senderId: 'ui-client' })));
  }, []);

  const cellStop = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(serializeCommand(createCellStopCommand({ senderId: 'ui-client' })));
  }, []);

  const clearWorkspace = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const currentRobotState = robotState ?? 'STANDBY';
    if (currentRobotState !== 'IDLE') return;
    // Workcell-authority: workspace clears on snapshot echo. TeleopClient
    // derives button state from the snapshot; the send is gated on IDLE only.
    setActionProgress(null);
    const cmd = createClearWorkspaceCommand({ senderId: 'ui-client' });
    wsRef.current.send(serializeCommand(cmd));
  }, [robotState]);

  const pushProbeLog = useCallback((status: string, detail: string) => {
    const entry: LogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      type: 'probe',
      timestamp: new Date().toLocaleTimeString(),
      data: { status, detail },
    };
    setLogs((prev) => [entry, ...prev].slice(0, 100));
  }, []);

  const sendPing = useCallback(async () => {
    // Disconnected: HTTP health probe against Gateway /health (never silent).
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      const healthUrl = resolveGatewayHealthUrl(wsUrl);
      try {
        const res = await fetch(healthUrl);
        if (res.ok) {
          pushProbeLog('UP', `Gateway reachable at ${healthUrl}`);
        } else {
          pushProbeLog(`${res.status}`, `Gateway probe ${healthUrl} returned ${res.status}`);
        }
      } catch (err) {
        pushProbeLog(
          'DOWN',
          `Gateway unreachable at ${healthUrl}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      return;
    }
    // Connected-but-not-streaming: WS PING command + EventLog probe entry.
    const pingCmd = createPingCommand({ senderId: 'ui-client' });
    wsRef.current.send(serializeCommand(pingCmd));
    pushProbeLog('PING', `Ping sent (${pingCmd.command_id})`);
  }, [wsUrl, pushProbeLog]);

  return {
    connectionState,
    conflictReason,
    logs,
    actionProgress,
    errorBanner,
    hasEverConnected,
    connect,
    disconnect,
    executePose,
    togglePalm,
    emergencyStop,
    cellFill,
    cellProcess,
    cellStop,
    resetFault,
    clearWorkspace,
    sendPing,
    pushProbeLog,
  };
}
