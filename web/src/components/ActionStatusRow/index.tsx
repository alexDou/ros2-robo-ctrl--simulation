import type { ActionProgress } from '@/hooks/useTeleopSession';
import { ActionProgressBar } from '../ActionProgressBar';

/** Fixed height, and every cell stays mounted: only content changes, so nothing blinks or shifts. */
export const ACTION_STATUS_ROW_HEIGHT = '3.8rem';

export interface ActionStatusRowProps {
  /** Robot-state message on the left; always shown, only its text changes. */
  message: string;
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
        backgroundColor: '#1f2937',
        borderRadius: '0.5rem',
      }}
    >
      <div
        data-testid="toolbar-disabled-reason"
        title={message}
        style={{
          flex: '1 1 0',
          minWidth: 0,
          padding: '0.75rem 1rem',
          color: '#e0e5ecff',
          fontSize: '0.86rem',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {message}
      </div>
      <div data-testid="action-status-progress" style={{ flex: '0 0 40%', minWidth: 0 }}>
        <ActionProgressBar progress={progress} />
      </div>
    </div>
  );
}
