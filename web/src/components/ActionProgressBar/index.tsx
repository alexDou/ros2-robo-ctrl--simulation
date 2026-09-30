import type { ActionProgress } from '@/hooks/useTeleopSession';

export interface ActionProgressBarProps {
  progress: ActionProgress;
}

export function ActionProgressBar({ progress }: ActionProgressBarProps) {
  const roundedPercent = Math.round(progress.percentComplete);
  const barColor = progress.phase === 'COMPLETED' ? '#10b981' : '#3b82f6';

  return (
    <div data-testid="action-progress-container" style={{ width: '100%', boxSizing: 'border-box' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.375rem',
          fontSize: '0.8125rem',
          color: '#e5e7eb',
        }}
      >
        <span>
          Action Phase: <strong data-testid="action-progress-phase">{progress.phase}</strong>
        </span>
        <span data-testid="action-progress-percent" style={{ fontWeight: 600, color: '#60a5fa' }}>
          {roundedPercent}%
        </span>
      </div>
      <div
        style={{
          width: '100%',
          height: '8px',
          backgroundColor: '#374151',
          borderRadius: '9999px',
          overflow: 'hidden',
        }}
      >
        <div
          data-testid="action-progress-bar"
          role="progressbar"
          aria-valuenow={roundedPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          style={{
            width: `${roundedPercent}%`,
            height: '100%',
            backgroundColor: barColor,
            borderRadius: '9999px',
            transition: 'width 0.15s ease',
          }}
        />
      </div>
    </div>
  );
}
