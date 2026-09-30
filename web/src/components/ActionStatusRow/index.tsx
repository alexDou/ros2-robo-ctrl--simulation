import type { ActionProgress } from '@/hooks/useTeleopSession';
import { ActionProgressBar } from '../ActionProgressBar';

/** Fixed height: the row renders even when empty, so nothing below it shifts. */
export const ACTION_STATUS_ROW_HEIGHT = '2.75rem';

export interface ActionStatusRowProps {
  /** Why the controls are unavailable (robot state), shown on the left. */
  message: string | null;
  /** Running action, shown on the right. */
  progress: ActionProgress | null;
}

export function ActionStatusRow({ message, progress }: ActionStatusRowProps) {
  return (
    <div
      data-testid="action-status-row"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        height: ACTION_STATUS_ROW_HEIGHT,
        minHeight: ACTION_STATUS_ROW_HEIGHT,
        flexShrink: 0,
        boxSizing: 'border-box',
        marginBottom: '0.75rem',
      }}
    >
      <div style={{ flex: '1 1 0', minWidth: 0 }}>
        {message && (
          <div
            data-testid="toolbar-disabled-reason"
            title={message}
            style={{
              color: '#9ca3af',
              fontSize: '0.8125rem',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {message}
          </div>
        )}
      </div>
      <div style={{ flex: '0 0 40%', minWidth: 0 }}>
        {progress && <ActionProgressBar progress={progress} />}
      </div>
    </div>
  );
}
