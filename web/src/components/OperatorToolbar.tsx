import { PoseName, type RobotState } from '@contracts';

export interface OperatorToolbarProps {
  robotState: RobotState | string | null;
  isGrasped: boolean;
  hasActiveGear: boolean;
  onExecutePose: (poseName: PoseName) => void;
  onTogglePalm: () => void;
  onEmergencyStop: () => void;
  onResetFault: () => void;
  onClearWorkspace: () => void;
  errorBanner?: { errorCode: string; message: string } | null;
  disabled?: boolean;
}

export function OperatorToolbar({
  robotState,
  isGrasped,
  hasActiveGear,
  onExecutePose,
  onTogglePalm,
  onEmergencyStop,
  onResetFault,
  onClearWorkspace,
  errorBanner,
  disabled = false,
}: OperatorToolbarProps) {
  const isIdle = robotState === 'IDLE';
  const isFault = robotState === 'FAULT';

  // Action buttons disabled unless robot is IDLE and not externally disabled
  const actionDisabled = disabled || !isIdle;
  const resetFaultDisabled = disabled || !isFault;
  const clearWorkspaceDisabled = disabled || !isIdle || !hasActiveGear;

  return (
    <div
      data-testid="operator-toolbar"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        backgroundColor: '#1f2937',
        borderRadius: '0.5rem',
        padding: '0.75rem 1rem',
        marginTop: '0.75rem',
        border: '1px solid #374151',
        boxSizing: 'border-box',
      }}
    >
      {errorBanner && (
        <div
          data-testid="toolbar-error-banner"
          style={{
            backgroundColor: '#fee2e2',
            border: '1px solid #ef4444',
            color: '#b91c1c',
            padding: '0.5rem 0.75rem',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <span style={{ fontWeight: 'bold' }}>⚠ [{errorBanner.errorCode}]</span>
          <span>{errorBanner.message}</span>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
        }}
      >
        {/* Left Cluster: Canned Poses */}
        <div
          data-testid="canned-pose-cluster"
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <span style={{ color: '#9ca3af', fontSize: '0.8125rem', fontWeight: 600 }}>Poses:</span>
          <button
            data-testid="pose-home-button"
            type="button"
            onClick={() => onExecutePose(PoseName.HOME)}
            disabled={actionDisabled}
            style={{
              backgroundColor: actionDisabled ? '#374151' : '#3b82f6',
              color: actionDisabled ? '#9ca3af' : '#ffffff',
              padding: '0.4rem 0.8rem',
              borderRadius: '0.375rem',
              border: 'none',
              fontSize: '0.8125rem',
              fontWeight: 600,
              cursor: actionDisabled ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.15s ease',
            }}
          >
            Home
          </button>
          <button
            data-testid="pose-ready-button"
            type="button"
            onClick={() => onExecutePose(PoseName.READY)}
            disabled={actionDisabled}
            style={{
              backgroundColor: actionDisabled ? '#374151' : '#3b82f6',
              color: actionDisabled ? '#9ca3af' : '#ffffff',
              padding: '0.4rem 0.8rem',
              borderRadius: '0.375rem',
              border: 'none',
              fontSize: '0.8125rem',
              fontWeight: 600,
              cursor: actionDisabled ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.15s ease',
            }}
          >
            Ready
          </button>
          <button
            data-testid="pose-inspect-button"
            type="button"
            onClick={() => onExecutePose(PoseName.INSPECT_POSE)}
            disabled={actionDisabled}
            style={{
              backgroundColor: actionDisabled ? '#374151' : '#3b82f6',
              color: actionDisabled ? '#9ca3af' : '#ffffff',
              padding: '0.4rem 0.8rem',
              borderRadius: '0.375rem',
              border: 'none',
              fontSize: '0.8125rem',
              fontWeight: 600,
              cursor: actionDisabled ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.15s ease',
            }}
          >
            Inspect
          </button>
        </div>

        {/* Center Cluster: Dexterous Palm Toggle */}
        <div
          data-testid="palm-control-cluster"
          style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}
        >
          <span style={{ color: '#9ca3af', fontSize: '0.8125rem', fontWeight: 600 }}>Palm:</span>
          <button
            data-testid="palm-toggle-button"
            type="button"
            onClick={onTogglePalm}
            disabled={actionDisabled}
            style={{
              backgroundColor: actionDisabled
                ? '#374151'
                : isGrasped
                  ? '#059669'
                  : '#4b5563',
              color: actionDisabled ? '#9ca3af' : '#ffffff',
              padding: '0.4rem 0.875rem',
              borderRadius: '0.375rem',
              border: 'none',
              fontSize: '0.8125rem',
              fontWeight: 600,
              cursor: actionDisabled ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.15s ease',
            }}
          >
            {isGrasped ? 'Release' : 'Grasp'}
          </button>
          <span
            data-testid="palm-status"
            style={{
              padding: '0.2rem 0.5rem',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: 600,
              backgroundColor: isGrasped ? '#065f46' : '#374151',
              color: isGrasped ? '#34d399' : '#9ca3af',
              border: `1px solid ${isGrasped ? '#059669' : '#4b5563'}`,
            }}
          >
            {isGrasped ? 'Grasped' : 'Released'}
          </span>
        </div>

        {/* Workspace Cluster: Workcell / Workspace Controls */}
        <div
          data-testid="workspace-control-cluster"
          style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}
        >
          <span style={{ color: '#9ca3af', fontSize: '0.8125rem', fontWeight: 600 }}>Workcell:</span>
          <button
            data-testid="clear-workspace-button"
            type="button"
            onClick={onClearWorkspace}
            disabled={clearWorkspaceDisabled}
            style={{
              backgroundColor: clearWorkspaceDisabled ? '#374151' : '#4b5563',
              color: clearWorkspaceDisabled ? '#9ca3af' : '#ffffff',
              padding: '0.4rem 0.8rem',
              borderRadius: '0.375rem',
              border: 'none',
              fontSize: '0.8125rem',
              fontWeight: 600,
              cursor: clearWorkspaceDisabled ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.15s ease',
            }}
          >
            Clear Workspace
          </button>
        </div>

        {/* Right Cluster: Safety Cluster */}
        <div
          data-testid="safety-control-cluster"
          style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}
        >
          <button
            data-testid="reset-fault-button"
            type="button"
            onClick={onResetFault}
            disabled={resetFaultDisabled}
            style={{
              backgroundColor: resetFaultDisabled ? '#374151' : '#f59e0b',
              color: resetFaultDisabled ? '#9ca3af' : '#ffffff',
              padding: '0.4rem 0.8rem',
              borderRadius: '0.375rem',
              border: 'none',
              fontSize: '0.8125rem',
              fontWeight: 600,
              cursor: resetFaultDisabled ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.15s ease',
            }}
          >
            Reset Fault
          </button>

          <button
            data-testid="emergency-stop-button"
            type="button"
            onClick={onEmergencyStop}
            style={{
              backgroundColor: '#dc2626',
              color: '#ffffff',
              padding: '0.5rem 1.125rem',
              borderRadius: '0.375rem',
              border: '2px solid #b91c1c',
              fontSize: '0.875rem',
              fontWeight: 800,
              letterSpacing: '0.05em',
              cursor: 'pointer',
              boxShadow: '0 0 10px rgba(220, 38, 38, 0.4)',
              transition: 'transform 0.1s ease, background-color 0.15s ease',
            }}
          >
            EMERGENCY STOP
          </button>
        </div>
      </div>
    </div>
  );
}
