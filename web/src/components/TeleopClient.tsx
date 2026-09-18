import { resolveGatewayWsUrl } from '@utils/url';
import { DEFAULT_ROBOT_ID } from '@contracts';
import { useTelemetryStream } from '@/hooks/useTelemetryStream';
import { useTeleopSession, type ConnectionState, type LogEntry } from '@/hooks/useTeleopSession';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { ConnectionBadge } from '@components/ConnectionBadge';
import { ConflictBanner } from '@components/ConflictBanner';
import { ActionProgressBar } from '@components/ActionProgressBar';
import { EventLog } from '@components/EventLog';
import { TelemetryMonitor } from '@components/TelemetryMonitor';
import { RobotVisualizer } from '@components/RobotVisualizer';
import { OperatorToolbar } from '@components/OperatorToolbar';

export type { ConnectionState, LogEntry };

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
  const wsUrl = resolveGatewayWsUrl(robotId, gatewayWsUrl);
  const isDesktop = useIsDesktop();

  const {
    bufferRef,
    isStreaming,
    robotState,
    palmState,
    handleIncomingFrame,
    resetStream,
  } = useTelemetryStream();

  const {
    connectionState,
    conflictReason,
    logs,
    hasActiveGear,
    actionProgress,
    errorBanner,
    connect,
    executePose,
    togglePalm,
    emergencyStop,
    resetFault,
    pickAndPlaceTarget,
    clearWorkspace,
    sendPing,
  } = useTeleopSession({
    wsUrl,
    handleIncomingFrame,
    resetStream,
    robotState,
    palmState,
  });

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
        <ConnectionBadge
          connectionState={connectionState}
          isStreaming={isStreaming}
          robotState={robotState}
        />
      </header>

      {connectionState === 'CONFLICT' && <ConflictBanner reason={conflictReason} />}

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
            position: 'relative',
          }}
        >
          <div style={{ flex: 1, width: '100%', minHeight: '480px', position: 'relative', overflow: 'hidden' }}>
            <RobotVisualizer
              urdfUrl={urdfUrl}
              assetBaseUrl={assetBaseUrl}
              telemetryBufferRef={bufferRef}
              jointPositionsRef={jointPositionsRef}
              robotState={robotState || 'IDLE'}
              hasActiveGear={hasActiveGear}
              onPickAndPlaceTarget={pickAndPlaceTarget}
              rendererFactory={rendererFactory}
              controlsFactory={controlsFactory}
              style={{ width: '100%', height: '100%' }}
            />
            {actionProgress && <ActionProgressBar progress={actionProgress} />}
          </div>
          <OperatorToolbar
            robotState={robotState || 'IDLE'}
            isGrasped={!!palmState?.is_grasped}
            hasActiveGear={hasActiveGear}
            onExecutePose={executePose}
            onTogglePalm={togglePalm}
            onEmergencyStop={emergencyStop}
            onResetFault={resetFault}
            onClearWorkspace={clearWorkspace}
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
            onClick={sendPing}
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

      <EventLog logs={logs} />
    </div>
  );
}
