import { useEffect, useRef } from 'preact/hooks';
import { CANONICAL_UR5E_JOINTS } from '@contracts';
import type { TelemetryBuffer } from '@/hooks/useTelemetryStream';

export interface TelemetryMonitorProps {
  bufferRef: { current: TelemetryBuffer };
  isStreaming: boolean;
  robotState?: string | null;
  layout?: 'vertical' | 'grid';
}

export function TelemetryMonitor({
  bufferRef,
  isStreaming,
  robotState,
  layout = 'grid',
}: TelemetryMonitorProps) {
  const jointValRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  const freqRef = useRef<HTMLSpanElement | null>(null);
  const latencyRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!isStreaming) {
      if (freqRef.current) freqRef.current.textContent = '0 Hz';
      if (latencyRef.current) latencyRef.current.textContent = '0 ms';
      for (const name of CANONICAL_UR5E_JOINTS) {
        const span = jointValRefs.current[name];
        if (span) span.textContent = '0.000 rad (0.0°)';
      }
      return;
    }

    let animId: number;
    let lastRenderedFrame = -1;

    const tick = () => {
      const buf = bufferRef.current;

      if (buf.frameCount !== lastRenderedFrame) {
        lastRenderedFrame = buf.frameCount;

        // Direct DOM textNode updates for 6 canonical UR5e joints (radians and degrees)
        for (let i = 0; i < CANONICAL_UR5E_JOINTS.length; i++) {
          const name = CANONICAL_UR5E_JOINTS[i];
          const span = jointValRefs.current[name];
          if (span) {
            const rad = buf.jointPositions[i] ?? 0;
            const deg = (rad * 180) / Math.PI;
            span.textContent = `${rad.toFixed(3)} rad (${deg.toFixed(1)}°)`;
          }
        }

        // Direct DOM update for rolling frequency and packet latency
        if (freqRef.current) {
          freqRef.current.textContent = `${buf.frequencyHz} Hz`;
        }
        if (latencyRef.current) {
          latencyRef.current.textContent = `${buf.latencyMs.toFixed(0)} ms`;
        }
      }

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(animId);
    };
  }, [bufferRef, isStreaming]);

  const isVertical = layout === 'vertical';

  return (
    <section
      data-testid="telemetry-monitor"
      style={{
        backgroundColor: '#111827',
        borderRadius: '0.5rem',
        padding: '1.25rem',
        marginBottom: '1.5rem',
        color: '#f9fafb',
        border: '1px solid #374151',
        height: isVertical ? '100%' : 'auto',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: isVertical ? 'column' : 'row',
          justifyContent: 'space-between',
          alignItems: isVertical ? 'flex-start' : 'center',
          gap: isVertical ? '0.75rem' : '1rem',
          marginBottom: '1rem',
          borderBottom: '1px solid #374151',
          paddingBottom: '0.75rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.125rem' }}>UR5e Telemetry</h2>
          {robotState && (
            <span
              data-testid="telemetry-robot-state-badge"
              style={{
                fontSize: '0.75rem',
                padding: '0.125rem 0.5rem',
                borderRadius: '9999px',
                backgroundColor: isStreaming ? '#10b98120' : '#4b556320',
                color: isStreaming ? '#10b981' : '#9ca3af',
                border: `1px solid ${isStreaming ? '#10b981' : '#4b5563'}`,
                fontWeight: 600,
              }}
            >
              {robotState}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '1.25rem', fontSize: '0.875rem' }}>
          <div>
            <span style={{ color: '#9ca3af', marginRight: '0.5rem' }}>Rate:</span>
            <span
              ref={freqRef}
              data-testid="telemetry-frequency"
              style={{ fontWeight: 600, color: isStreaming ? '#10b981' : '#9ca3af' }}
            >
              0 Hz
            </span>
          </div>
          <div>
            <span style={{ color: '#9ca3af', marginRight: '0.5rem' }}>Latency:</span>
            <span
              ref={latencyRef}
              data-testid="telemetry-latency"
              style={{ fontWeight: 600, color: isStreaming ? '#10b981' : '#9ca3af' }}
            >
              0 ms
            </span>
          </div>
        </div>
      </div>

      <div
        style={
          isVertical
            ? {
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }
            : {
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '0.75rem',
              }
        }
      >
        {CANONICAL_UR5E_JOINTS.map((jointName) => (
          <div
            key={jointName}
            data-testid={`joint-row-${jointName}`}
            style={{
              backgroundColor: '#1f2937',
              padding: '0.75rem',
              borderRadius: '0.375rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.25rem',
            }}
          >
            <span style={{ color: '#9ca3af', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {jointName.replace(/_/g, ' ')}
            </span>
            <span
              ref={(el) => {
                jointValRefs.current[jointName] = el;
              }}
              data-testid={`joint-val-${jointName}`}
              style={{ fontFamily: 'monospace', fontSize: '0.95rem', fontWeight: 600, color: '#60a5fa' }}
            >
              0.000 rad (0.0°)
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

