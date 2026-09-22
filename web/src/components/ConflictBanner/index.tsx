export interface ConflictBannerProps {
  reason: string | null;
}

export function ConflictBanner({ reason }: ConflictBannerProps) {
  return (
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
      <strong>Session Conflict:</strong> {reason || 'Another active session already controls this robot.'}
    </div>
  );
}
