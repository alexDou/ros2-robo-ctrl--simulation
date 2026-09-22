import type { LogEntry } from '@/hooks/useTeleopSession';

export interface EventLogProps {
  logs: readonly LogEntry[];
}

export function EventLog({ logs }: EventLogProps) {
  return (
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
          <p style={{ color: '#9ca3af', fontStyle: 'italic', margin: 0 }}>
            No telemetry frames received yet.
          </p>
        ) : (
          logs.map((log) => {
            if (log.type === 'error') {
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
                    [{log.timestamp}] <strong>[ERROR: {log.data.error_code}]</strong> {log.data.message}
                  </div>
                </div>
              );
            }

            if (log.type === 'probe') {
              return (
                <div
                  key={log.id}
                  data-testid="log-item-probe"
                  style={{
                    borderLeft: '4px solid #3b82f6',
                    paddingLeft: '0.75rem',
                    marginBottom: '0.75rem',
                    color: '#bfdbfe',
                  }}
                >
                  <div>
                    [{log.timestamp}] <strong>[PING: {log.data.status}]</strong> {log.data.detail}
                  </div>
                </div>
              );
            }

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
                  [{log.timestamp}] <strong>[TELEMETRY]</strong> State: {log.data.robot_state}
                  {log.data.command_id ? ` (Ack: ${log.data.command_id})` : ''}
                </div>
                <div style={{ color: '#9ca3af', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                  Joints: [{log.data.joint_positions.map((p) => p.toFixed(3)).join(', ')}]
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
