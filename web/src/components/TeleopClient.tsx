import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { isBrowser } from '@utils/env';
import {
  DEFAULT_ROBOT_ID,
  isErrorFrame,
  PalmAction,
  PoseName,
  type RobotTelemetryEvent,
  type ErrorFrame,
} from '@contracts';
import {
  createPingCommand,
  createTrajectoryExecuteCommand,
  createPalmActuateCommand,
  createEmergencyStopCommand,
  createResetFaultCommand,
  createPickAndPlaceTargetCommand,
  createClearWorkspaceCommand,
  serializeCommand,
  type PickAndPlaceTargetPayload,
} from '@domain/parsers';
import { useTelemetryStream } from '@/hooks/useTelemetryStream';
import { TelemetryMonitor } from '@components/TelemetryMonitor';
import { RobotVisualizer } from '@components/RobotVisualizer';
import { OperatorToolbar } from '@components/OperatorToolbar';

export type ConnectionState = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'CONFLICT';

export interface LogEntry {
  id: string;
  type: 'telemetry' | 'error';
  timestamp: string;
  data: RobotTelemetryEvent | ErrorFrame;
}

export interface TeleopClientProps {
  robotId?: string;
  gatewayWsUrl?: string;
  urdfUrl?: string;
  assetBaseUrl?: string;
  rendererFactory?: (canvas: HTMLCanvasElement) => any;
  controlsFactory?: (camera: any, domElement: any) => any;
  jointPositionsRef?: { current: readonly number[] };
}

export function TeleopClient({
  robotId = DEFAULT_ROBOT_ID,
  gatewayWsUrl,
  urdfUrl,
  assetBaseUrl,
  rendererFactory,
  controlsFactory,
  jointPositionsRef,
}: TeleopClientProps) {
  const defaultProto =
    isBrowser() && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const defaultHost =
    isBrowser() && window.location.hostname ? window.location.hostname : 'localhost';
  const queryPort =
    isBrowser() && window.location.search
      ? new URLSearchParams(window.location.search).get('gateway_port')
      : null;
  const defaultPort = queryPort || '8080';
  const wsUrl =
    gatewayWsUrl || `${defaultProto}//${defaultHost}:${defaultPort}/ws/teleop/robot/${robotId}`;

  const [connectionState, setConnectionState] = useState<ConnectionState>('CONNECTING');
  const [conflictReason, setConflictReason] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [hasActiveGear, setHasActiveGear] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window !== 'undefined') {
      if (typeof window.matchMedia === 'function') {
        return window.matchMedia('(min-width: 1024px)').matches;
      }
      if (typeof window.innerWidth === 'number') {
        return window.innerWidth >= 1024;
      }
    }
    return true;
  });
  const wsRef = useRef<WebSocket | null>(null);
  const isCleaningUp = useRef(false);
  const lastLoggedStateRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };

    if (typeof window.matchMedia === 'function') {
      const mql = window.matchMedia('(min-width: 1024px)');
      setIsDesktop(mql.matches);
      const handleChange = (e: MediaQueryListEvent) => {
        setIsDesktop(e.matches);
      };
      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', handleChange);
      }
      window.addEventListener('resize', handleResize);
      return () => {
        if (typeof mql.removeEventListener === 'function') {
          mql.removeEventListener('change', handleChange);
        }
        window.removeEventListener('resize', handleResize);
      };
    }

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [errorBanner, setErrorBanner] = useState<{ errorCode: string; message: string } | null>(null);
  const errorBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    bufferRef,
    isStreaming,
    robotState,
    palmState,
    handleIncomingFrame,
    resetStream,
  } = useTelemetryStream();

  const connect = useCallback(() => {
    isCleaningUp.current = false;
    lastLoggedStateRef.current = null;
    setConnectionState('CONNECTING');
    setConflictReason(null);
    resetStream();

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    if (isBrowser()) {
      (window as unknown as { __teleop_ws?: WebSocket }).__teleop_ws = ws;
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
        } else if (isErrorFrame(parsed)) {
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
      } catch (err) {
        console.warn('Failed to parse incoming WebSocket frame:', err);
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
        // Network failure
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
        delete (window as unknown as { __teleop_ws?: WebSocket }).__teleop_ws;
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  const handleExecutePose = useCallback((poseName: PoseName) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const cmd = createTrajectoryExecuteCommand(poseName, { senderId: 'ui-client' });
    wsRef.current.send(serializeCommand(cmd));
  }, []);

  const handleTogglePalm = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const action = palmState?.is_grasped ? PalmAction.RELEASE : PalmAction.GRASP;
    const cmd = createPalmActuateCommand(action, { senderId: 'ui-client' });
    wsRef.current.send(serializeCommand(cmd));
  }, [palmState?.is_grasped]);

  const handleEmergencyStop = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const cmd = createEmergencyStopCommand({
      reason: 'Operator toolbar emergency stop triggered',
      senderId: 'ui-client',
    });
    wsRef.current.send(serializeCommand(cmd));
  }, []);

  const handleResetFault = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const cmd = createResetFaultCommand({ senderId: 'ui-client' });
    wsRef.current.send(serializeCommand(cmd));
  }, []);

  const handlePickAndPlaceTarget = useCallback(
    (payload: PickAndPlaceTargetPayload) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      const currentRobotState = robotState ?? 'IDLE';
      if (currentRobotState !== 'IDLE') return;
      const cmd = createPickAndPlaceTargetCommand(payload, { senderId: 'ui-client' });
      wsRef.current.send(serializeCommand(cmd));
      setHasActiveGear(true);
    },
    [robotState]
  );

  const handleClearWorkspace = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const currentRobotState = robotState ?? 'IDLE';
    if (currentRobotState !== 'IDLE') return;
    if (!hasActiveGear) return;
    const cmd = createClearWorkspaceCommand({ senderId: 'ui-client' });
    wsRef.current.send(serializeCommand(cmd));
    setHasActiveGear(false);
  }, [robotState, hasActiveGear]);

  const handlePing = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const pingCmd = createPingCommand({ senderId: 'ui-client' });
    wsRef.current.send(serializeCommand(pingCmd));
  };

  const getBadgeColor = () => {
    switch (connectionState) {
      case 'CONNECTED':
        return '#10b981';
      case 'CONNECTING':
        return '#f59e0b';
      case 'CONFLICT':
        return '#ef4444';
      case 'DISCONNECTED':
      default:
        return '#6b7280';
    }
  };

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '1.5rem', fontFamily: 'sans-serif' }}>
      <style>{`
        .teleop-split-layout {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          width: 100%;
          margin-bottom: 1.5rem;
        }
        .teleop-visualizer-pane {
          width: 100%;
          min-width: 0;
          min-height: 480px;
        }
        .teleop-sidebar-pane {
          width: 100%;
          min-width: 0;
        }
        @media (min-width: 1024px) {
          .teleop-split-layout {
            flex-direction: row;
            align-items: stretch;
          }
          .teleop-visualizer-pane {
            flex: 0 0 75%;
            max-width: 75%;
            min-height: 560px;
          }
          .teleop-sidebar-pane {
            flex: 0 0 25%;
            max-width: 25%;
          }
        }
      `}</style>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '1.5rem' }}>Teleop Control — {robotId}</h1>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>Gateway: {wsUrl}</p>
        </div>
        <div
          data-testid="connection-badge"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '0.25rem 0.75rem',
            borderRadius: '9999px',
            fontSize: '0.875rem',
            fontWeight: 600,
            backgroundColor: `${getBadgeColor()}20`,
            color: getBadgeColor(),
            border: `1px solid ${getBadgeColor()}`,
          }}
        >
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: getBadgeColor(),
              marginRight: '0.5rem',
            }}
          />
          {isStreaming && connectionState === 'CONNECTED'
            ? `CONNECTED / ${robotState || 'IDLE'}`
            : connectionState}
        </div>
      </header>

      {connectionState === 'CONFLICT' && (
        <div
          data-testid="conflict-banner"
          style={{
            backgroundColor: '#fee2e2',
            border: '1px solid #ef4444',
            color: '#b91c1c',
            padding: '1rem',
            borderRadius: '0.375rem',
            marginBottom: '1.5rem',
          }}
        >
          <strong>Session Conflict:</strong> {conflictReason || 'Another active session already controls this robot.'}
        </div>
      )}

      <div
        data-testid="teleop-split-layout"
        className="teleop-split-layout"
        style={{
          display: 'flex',
          flexDirection: isDesktop ? 'row' : 'column',
          gap: '1.5rem',
          width: '100%',
          marginBottom: '1.5rem',
          alignItems: 'stretch',
        }}
      >
        <div
          data-testid="visualizer-pane"
          className="teleop-visualizer-pane"
          style={{
            flex: isDesktop ? '0 0 75%' : '1 1 100%',
            maxWidth: isDesktop ? '75%' : '100%',
            width: isDesktop ? '75%' : '100%',
            minWidth: 0,
            minHeight: '480px',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <RobotVisualizer
            urdfUrl={urdfUrl}
            assetBaseUrl={assetBaseUrl}
            telemetryBufferRef={bufferRef}
            jointPositionsRef={jointPositionsRef}
            robotState={robotState || 'IDLE'}
            hasActiveGear={hasActiveGear}
            onPickAndPlaceTarget={handlePickAndPlaceTarget}
            rendererFactory={rendererFactory}
            controlsFactory={controlsFactory}
            style={{ flex: 1, width: '100%', minHeight: '480px' }}
          />
          <OperatorToolbar
            robotState={robotState || 'IDLE'}
            isGrasped={!!palmState?.is_grasped}
            hasActiveGear={hasActiveGear}
            onExecutePose={handleExecutePose}
            onTogglePalm={handleTogglePalm}
            onEmergencyStop={handleEmergencyStop}
            onResetFault={handleResetFault}
            onClearWorkspace={handleClearWorkspace}
            errorBanner={errorBanner}
            disabled={connectionState !== 'CONNECTED'}
          />
        </div>
        <div
          data-testid="sidebar-pane"
          className="teleop-sidebar-pane"
          style={{
            flex: isDesktop ? '0 0 25%' : '1 1 100%',
            maxWidth: isDesktop ? '25%' : '100%',
            width: isDesktop ? '25%' : '100%',
            minWidth: 0,
            boxSizing: 'border-box',
          }}
        >
          <TelemetryMonitor
            bufferRef={bufferRef}
            isStreaming={isStreaming}
            robotState={robotState}
            layout={isDesktop ? 'vertical' : 'grid'}
          />
        </div>
      </div>

      {!isStreaming && (
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
          <button
            data-testid="verify-connection-button"
            onClick={handlePing}
            disabled={connectionState !== 'CONNECTED'}
            style={{
              backgroundColor: connectionState === 'CONNECTED' ? '#2563eb' : '#9ca3af',
              color: '#fff',
              fontWeight: 600,
              padding: '0.5rem 1.5rem',
              borderRadius: '0.375rem',
              border: 'none',
              cursor: connectionState === 'CONNECTED' ? 'pointer' : 'not-allowed',
            }}
          >
            Verify Connection (Ping)
          </button>
        </div>
      )}

      {connectionState === 'DISCONNECTED' && (
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
          <button
            onClick={connect}
            style={{
              backgroundColor: '#4b5563',
              color: '#fff',
              fontWeight: 600,
              padding: '0.5rem 1rem',
              borderRadius: '0.375rem',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Reconnect
          </button>
        </div>
      )}

      <section>
        <h2 style={{ fontSize: '1.125rem', marginBottom: '0.75rem' }}>Real-Time Event Log</h2>
        <div
          data-testid="event-log"
          style={{
            backgroundColor: '#1f2937',
            color: '#f9fafb',
            borderRadius: '0.5rem',
            padding: '1rem',
            height: '350px',
            overflowY: 'auto',
            fontFamily: 'monospace',
            fontSize: '0.875rem',
          }}
        >
          {logs.length === 0 ? (
            <p style={{ color: '#9ca3af', fontStyle: 'italic', margin: 0 }}>No telemetry frames received yet.</p>
          ) : (
            logs.map((log) => {
              if (log.type === 'error') {
                const err = log.data as ErrorFrame;
                return (
                  <div
                    key={log.id}
                    data-testid="log-item-error"
                    style={{
                      borderLeft: '4px solid #ef4444',
                      paddingLeft: '0.75rem',
                      marginBottom: '0.75rem',
                      color: '#fca5a5',
                    }}
                  >
                    <div>
                      [{log.timestamp}] <strong>[ERROR: {err.error_code}]</strong> {err.message}
                    </div>
                  </div>
                );
              }

              const telem = log.data as RobotTelemetryEvent;
              return (
                <div
                  key={log.id}
                  style={{
                    borderLeft: '4px solid #10b981',
                    paddingLeft: '0.75rem',
                    marginBottom: '0.75rem',
                  }}
                >
                  <div>
                    [{log.timestamp}] <strong>[TELEMETRY]</strong> State: {telem.robot_state}
                    {telem.command_id ? ` (Ack: ${telem.command_id})` : ''}
                  </div>
                  <div style={{ color: '#9ca3af', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                    Joints: [{telem.joint_positions.map((p) => p.toFixed(3)).join(', ')}]
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
