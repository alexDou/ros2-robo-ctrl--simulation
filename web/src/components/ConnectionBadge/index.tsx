import type { ConnectionState } from '@/hooks/useTeleopSession';

export interface ConnectionBadgeProps {
  connectionState: ConnectionState;
  isStreaming: boolean;
  robotState?: string | null;
}

function getBadgeColor(connectionState: ConnectionState): string {
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
}

export function ConnectionBadge({
  connectionState,
  isStreaming,
  robotState,
}: ConnectionBadgeProps) {
  const badgeColor = getBadgeColor(connectionState);
  const displayState = robotState ?? 'STANDBY';
  const stateSuffix =
    displayState === 'STANDBY'
      ? ' / STANDBY (parked)'
      : displayState === 'BOOTING'
        ? ' / BOOTING (activating)'
        : ` / ${displayState}`;

  return (
    <div
      data-testid="connection-badge"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '0.25rem 0.75rem',
        borderRadius: '9999px',
        fontSize: '0.875rem',
        fontWeight: 600,
        backgroundColor: `${badgeColor}20`,
        color: badgeColor,
        border: `1px solid ${badgeColor}`,
      }}
    >
      <span
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: badgeColor,
          marginRight: '0.5rem',
        }}
      />
      {isStreaming && connectionState === 'CONNECTED'
        ? `CONNECTED${stateSuffix}`
        : connectionState === 'CONNECTED'
          ? `CONNECTED${stateSuffix}`
          : connectionState}
    </div>
  );
}
