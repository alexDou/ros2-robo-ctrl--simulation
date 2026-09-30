import { useState, useCallback, useEffect } from 'preact/hooks';
import { resolveGatewayWsUrl } from '@utils/url';
import { CANONICAL_POSES, DEFAULT_ROBOT_ID } from '@contracts';
import { isAtPose } from '@utils/workcellProgress';
import { useTelemetryStream } from '@/hooks/useTelemetryStream';
import { useTeleopSession, type ConnectionState, type LogEntry } from '@/hooks/useTeleopSession';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { useConveyor } from '@/hooks/useConveyor';
import { useWorkcellWaiters } from '@/hooks/useWorkcellWaiters';
import { ConnectionBadge } from '@components/ConnectionBadge';
import { ConflictBanner } from '@components/ConflictBanner';
import { ActionStatusRow } from '@components/ActionStatusRow';
import { EventLog } from '@components/EventLog';
import { TelemetryMonitor } from '@components/TelemetryMonitor';
import { RobotVisualizer } from '@components/RobotVisualizer';
import { OperatorToolbar } from '@components/OperatorToolbar';

export type { ConnectionState, LogEntry };

const BOOT_TIMEOUT_MS = 10000;

export interface TeleopClientProps {
  robotId?: string;
  gatewayWsUrl?: string;
  urdfUrl?: string;
  assetBaseUrl?: string;
  rendererFactory?: (canvas: HTMLCanvasElement) => any;
  controlsFactory?: (camera: any, domElement: any) => any;
  jointPositionsRef?: { current: readonly number[] };
  /** Deterministic deck and belt randomness (tests, E2E); defaults to the clock. */
  seed?: number;
  /** Belt simulation speed-up for tests; 1 = real time. */
  timeScale?: number;
}

export function TeleopClient({
  robotId = DEFAULT_ROBOT_ID,
  gatewayWsUrl,
  urdfUrl,
  assetBaseUrl,
  rendererFactory,
  controlsFactory,
  jointPositionsRef,
  seed,
  timeScale,
}: TeleopClientProps) {
  const wsUrl = resolveGatewayWsUrl(robotId, gatewayWsUrl);
  const isDesktop = useIsDesktop();

  const {
    bufferRef,
    isStreaming,
    robotState,
    palmState,
    workcellVersion,
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
    disconnect,
    executePose,
    resetFault,
    spawnObject,
    pickAndPlace,
    clearWorkspace,
    sendPing,
    pushProbeLog,
  } = useTeleopSession({
    wsUrl,
    handleIncomingFrame,
    resetStream,
    robotState,
    palmState,
  });

  // Workcell-authority: Clear-button state derives from snapshot buckets,
  // not visualizer callbacks. bufferRef.current.workcellState updates in
  // place per frame, so read it during render. workcellVersion subscription
  // forces re-render when bucket signature changes (buffer mutation alone
  // triggers no render).
  void workcellVersion;
  const snap = bufferRef.current?.workcellState;
  const workcellHasGears =
    (snap?.spawned?.length ?? 0) > 0 ||
    (snap?.inProgress?.length ?? 0) > 0 ||
    (snap?.processed?.length ?? 0) > 0;

  const waitUntil = useWorkcellWaiters(connectionState, robotState, workcellVersion);
  const goHomePose = useCallback(() => executePose('HOME'), [executePose]);
  const armAtHome = useCallback(
    () => isAtPose(bufferRef.current?.jointPositions, CANONICAL_POSES.HOME),
    [bufferRef],
  );
  const workcell = useCallback(() => bufferRef.current?.workcellState, [bufferRef]);
  const { conveyorStatus, deck, feederRef, handleFill, handleProcess, handleStop } = useConveyor({
    connected: connectionState === 'CONNECTED',
    robotState,
    workcell,
    spawnObject,
    pickAndPlace,
    goHomePose,
    armAtHome,
    waitUntil,
    report: pushProbeLog,
    seed,
    timeScale,
  });

  const handleClearWorkspace = useCallback(() => {
    clearWorkspace();
  }, [clearWorkspace]);

  // BOOTING window: activation (switch + sub + home) takes seconds.
  // Fall back to STANDBY display when no telemetry arrives within the budget.
  const [bootTimedOut, setBootTimedOut] = useState(false);
  useEffect(() => {
    if (connectionState === 'CONNECTED' && !isStreaming) {
      setBootTimedOut(false);
      const timer = setTimeout(() => setBootTimedOut(true), BOOT_TIMEOUT_MS);
      return () => clearTimeout(timer);
    }
    setBootTimedOut(false);
    return undefined;
  }, [connectionState, isStreaming]);
  const effectiveRobotState: string | null =
    connectionState === 'CONNECTED' && !isStreaming
      ? bootTimedOut
        ? 'STANDBY'
        : 'BOOTING'
      : (robotState ?? 'STANDBY');
  const toolbarDisabled = connectionState !== 'CONNECTED';
  const toolbarDisabledReason =
    connectionState !== 'CONNECTED'
      ? 'Robot controls unavailable: not connected. Press Connect to activate.'
      : effectiveRobotState === 'STANDBY'
        ? 'Robot parked in STANDBY. Connect handshake activates controllers.'
        : effectiveRobotState === 'BOOTING'
          ? 'Robot activating (BOOTING): controllers switching, joints subscribing, homing.'
          : `Robot ${effectiveRobotState}: actions resume when IDLE.`;

  return (
    <div
      style={{ maxWidth: '1440px', margin: '0 auto', padding: '1.5rem', fontFamily: 'sans-serif' }}
    >
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
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
        }}
      >
        <div>
          <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '1.5rem' }}>Teleop Control — {robotId}</h1>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>Gateway: {wsUrl}</p>
        </div>
        <ConnectionBadge
          connectionState={connectionState}
          isStreaming={isStreaming}
          robotState={effectiveRobotState}
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
          <ActionStatusRow
            message={
              toolbarDisabled || effectiveRobotState !== 'IDLE' ? toolbarDisabledReason : null
            }
            progress={actionProgress}
          />
          <div
            style={{
              flex: 1,
              width: '100%',
              minHeight: '480px',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <RobotVisualizer
              urdfUrl={urdfUrl}
              assetBaseUrl={assetBaseUrl}
              telemetryBufferRef={bufferRef}
              jointPositionsRef={jointPositionsRef}
              robotState={effectiveRobotState ?? 'STANDBY'}
              hopperCount={deck.length}
              beltFeederRef={feederRef}
              rendererFactory={rendererFactory}
              controlsFactory={controlsFactory}
              style={{ width: '100%', height: '100%' }}
            />
          </div>
          <OperatorToolbar
            robotState={effectiveRobotState ?? 'STANDBY'}
            connectionState={connectionState}
            hasActiveGear={hasActiveGear || workcellHasGears}
            conveyorStatus={conveyorStatus}
            hopperCount={deck.length}
            onExecutePose={executePose}
            onConnect={connect}
            onDisconnect={disconnect}
            onResetFault={resetFault}
            onClearWorkspace={handleClearWorkspace}
            onFill={handleFill}
            onProcess={handleProcess}
            onStop={handleStop}
            errorBanner={errorBanner}
            disabled={toolbarDisabled}
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
            robotState={effectiveRobotState}
            layout={isDesktop ? 'vertical' : 'grid'}
          />
        </div>
      </div>

      {!isStreaming && (
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
          <button
            data-testid="verify-connection-button"
            onClick={() => void sendPing()}
            style={{
              backgroundColor: '#2563eb',
              color: '#fff',
              fontWeight: 600,
              padding: '0.5rem 1.5rem',
              borderRadius: '0.375rem',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Verify Connection (Ping)
          </button>
        </div>
      )}

      <EventLog logs={logs} />
    </div>
  );
}
