import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import {
  RobotTelemetryEvent,
  ErrorFrame,
  createPingCommand,
  serializeCommand,
  isRobotTelemetryEvent,
  isErrorFrame,
} from './contracts';

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
}

export function TeleopClient({ robotId = 'robot-0', gatewayWsUrl }: TeleopClientProps) {
  const defaultProto =
    typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const defaultHost =
    typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : 'localhost';
  const wsUrl =
    gatewayWsUrl || `${defaultProto}//${defaultHost}:8080/ws/teleop/robot/${robotId}`;

  const [connectionState, setConnectionState] = useState<ConnectionState>('CONNECTING');
  const [conflictReason, setConflictReason] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const isCleaningUp = useRef(false);

  const connect = useCallback(() => {
    isCleaningUp.current = false;
    setConnectionState('CONNECTING');
    setConflictReason(null);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (isCleaningUp.current) return;
      setConnectionState('CONNECTED');
      setConflictReason(null);
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(event.data);
        const logId = `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const timeStr = new Date().toLocaleTimeString();

        if (isRobotTelemetryEvent(parsed)) {
          const entry: LogEntry = {
            id: logId,
            type: 'telemetry',
            timestamp: timeStr,
            data: parsed,
          };
          setLogs((prev) => [entry, ...prev].slice(0, 100));
        } else if (isErrorFrame(parsed)) {
          const entry: LogEntry = {
            id: logId,
            type: 'error',
            timestamp: timeStr,
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
      if (event.code === 4409 || event.reason === 'Conflict') {
        setConnectionState('CONFLICT');
        setConflictReason('Active session already exists for robot');
      } else {
        setConnectionState((curr) => (curr === 'CONFLICT' ? 'CONFLICT' : 'DISCONNECTED'));
      }
    };
  }, [wsUrl]);

  useEffect(() => {
    connect();
    return () => {
      isCleaningUp.current = true;
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

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
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '1.5rem', fontFamily: 'sans-serif' }}>
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
          {connectionState}
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

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
        <button
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
          Ping Robot
        </button>

        {connectionState === 'DISCONNECTED' && (
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
        )}
      </div>

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
