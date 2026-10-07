import { PoseName, type RobotState } from '@contracts';
import type { ConnectionState } from '@/hooks/useTeleopSession';
import { canFill, canProcess, canStop, type ConveyorStatus } from '@utils/conveyorGating';

export interface OperatorToolbarProps {
  robotState: RobotState | string | null;
  connectionState: ConnectionState;
  hasActiveGear: boolean;
  conveyorStatus: ConveyorStatus;
  onExecutePose: (poseName: PoseName) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onResetFault: () => void;
  onEmergencyStop: () => void;
  onClearWorkspace: () => void;
  onFill: () => void;
  onProcess: () => void;
  onStop: () => void;
  errorBanner?: { errorCode: string; message: string } | null;
  disabled?: boolean;
}

export function OperatorToolbar({
  robotState,
  connectionState,
  hasActiveGear,
  conveyorStatus,
  onExecutePose,
  onConnect,
  onDisconnect,
  onResetFault,
  onEmergencyStop,
  onClearWorkspace,
  onFill,
  onProcess,
  onStop,
  errorBanner,
  disabled = false,
}: OperatorToolbarProps) {
  const isIdle = robotState === 'IDLE';
  // A device fault (D20) faults the cell without faulting the arm; both recover by RESET_FAULT.
  const isFault = robotState === 'FAULT' || conveyorStatus === 'FAULT';

  // Action buttons disabled unless robot is IDLE and not externally disabled
  const cellBusy = conveyorStatus === 'RESETTING' || conveyorStatus === 'FAULT';
  const actionDisabled = disabled || !isIdle || cellBusy;
  const resetFaultDisabled = disabled || !isFault;
  const clearWorkspaceDisabled = disabled || !isIdle || cellBusy || !hasActiveGear;
  const fillButtonDisabled = disabled || !canFill(conveyorStatus);
  const processButtonDisabled = disabled || !isIdle || !canProcess(conveyorStatus);
  const stopButtonDisabled = disabled || !canStop(conveyorStatus);
  const isConnected = connectionState === 'CONNECTED' || connectionState === 'CONNECTING';

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
        {/* Left Cluster: Canned Poses (Home only) */}
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
        </div>

        {/* Workspace Cluster: Workcell / Workspace Controls */}
        <div
          data-testid="workspace-control-cluster"
          style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}
        >
          <span style={{ color: '#9ca3af', fontSize: '0.8125rem', fontWeight: 600 }}>
            Workcell:
          </span>
          <button
            data-testid="fill-button"
            type="button"
            onClick={onFill}
            disabled={fillButtonDisabled}
            style={{
              backgroundColor: fillButtonDisabled ? '#374151' : '#7c3aed',
              color: fillButtonDisabled ? '#9ca3af' : '#ffffff',
              padding: '0.4rem 0.8rem',
              borderRadius: '0.375rem',
              border: 'none',
              fontSize: '0.8125rem',
              fontWeight: 600,
              cursor: fillButtonDisabled ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.15s ease',
            }}
          >
            Fill
          </button>
          <button
            data-testid="process-button"
            type="button"
            onClick={onProcess}
            disabled={processButtonDisabled}
            style={{
              backgroundColor: processButtonDisabled ? '#374151' : '#059669',
              color: processButtonDisabled ? '#9ca3af' : '#ffffff',
              padding: '0.4rem 0.8rem',
              borderRadius: '0.375rem',
              border: 'none',
              fontSize: '0.8125rem',
              fontWeight: 600,
              cursor: processButtonDisabled ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.15s ease',
            }}
          >
            Process
          </button>
          <button
            data-testid="stop-button"
            type="button"
            onClick={onStop}
            disabled={stopButtonDisabled}
            style={{
              backgroundColor: stopButtonDisabled ? '#374151' : '#dc2626',
              color: stopButtonDisabled ? '#9ca3af' : '#ffffff',
              padding: '0.4rem 0.8rem',
              borderRadius: '0.375rem',
              border: 'none',
              fontSize: '0.8125rem',
              fontWeight: 600,
              cursor: stopButtonDisabled ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.15s ease',
            }}
          >
            Stop
          </button>
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

        {/* Right Cluster: Fault Reset + Connection Toggle */}
        <div
          data-testid="connection-control-cluster"
          style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}
        >
          {/* D36: always live while a session is up, whatever the arm or cell state */}
          {connectionState === 'CONNECTED' && (
            <button
              data-testid="emergency-stop-button"
              type="button"
              onClick={onEmergencyStop}
              style={{
                backgroundColor: '#b91c1c',
                color: '#ffffff',
                padding: '0.4rem 0.8rem',
                borderRadius: '0.375rem',
                border: '2px solid #fde047',
                fontSize: '0.8125rem',
                fontWeight: 700,
                letterSpacing: '0.03em',
                cursor: 'pointer',
              }}
            >
              EMERGENCY STOP
            </button>
          )}
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

          {isConnected ? (
            <button
              data-testid="disconnect-button"
              type="button"
              onClick={onDisconnect}
              style={{
                backgroundColor: '#4b5563',
                color: '#fff',
                fontWeight: 600,
                padding: '0.4rem 0.8rem',
                borderRadius: '0.375rem',
                border: 'none',
                fontSize: '0.8125rem',
                cursor: 'pointer',
              }}
            >
              Disconnect
            </button>
          ) : (
            <button
              data-testid="connect-button"
              type="button"
              onClick={onConnect}
              style={{
                backgroundColor: '#2563eb',
                color: '#fff',
                fontWeight: 600,
                padding: '0.4rem 0.8rem',
                borderRadius: '0.375rem',
                border: 'none',
                fontSize: '0.8125rem',
                cursor: 'pointer',
              }}
            >
              Connect
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
