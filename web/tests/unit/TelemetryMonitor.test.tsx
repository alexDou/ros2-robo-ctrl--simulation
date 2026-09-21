import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/preact';
import { TelemetryMonitor } from '@components/TelemetryMonitor';
import { useTelemetryStream, type TelemetryBuffer } from '@/hooks/useTelemetryStream';
import { CANONICAL_UR5E_JOINTS, RobotState, type RobotTelemetryEvent } from '@contracts';

describe('TelemetryMonitor & useTelemetryStream', () => {
  let rafCallbacks: FrameRequestCallback[] = [];
  let originalRaf: typeof requestAnimationFrame;
  let originalCaf: typeof cancelAnimationFrame;

  beforeEach(() => {
    rafCallbacks = [];
    originalRaf = window.requestAnimationFrame;
    originalCaf = window.cancelAnimationFrame;

    window.requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    window.cancelAnimationFrame = vi.fn();
  });

  afterEach(() => {
    window.requestAnimationFrame = originalRaf;
    window.cancelAnimationFrame = originalCaf;
    vi.restoreAllMocks();
  });

  function triggerRaf(time = performance.now()) {
    const cbs = [...rafCallbacks];
    rafCallbacks = [];
    for (const cb of cbs) {
      cb(time);
    }
  }

  it('renders 6 canonical joint elements in initial zero state', () => {
    const buffer: { current: TelemetryBuffer } = {
      current: {
        jointPositions: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        timestampNs: 0n.toString(),
        robotState: RobotState.IDLE,
        workcellState: { spawned: [], inProgress: [], processed: [], activeId: null },
        frequencyHz: 0,
        latencyMs: 0,
        lastPacketTime: 0,
        frameCount: 0,
      },
    };

    render(<TelemetryMonitor bufferRef={buffer} isStreaming={true} />);

    // Check all 6 canonical joints rendered
    for (const jointName of CANONICAL_UR5E_JOINTS) {
      expect(screen.getByTestId(`joint-row-${jointName}`)).toBeDefined();
    }

    // Trigger RAF paint
    act(() => {
      triggerRaf();
    });

    // Check zero values with radians and degrees
    const panVal = screen.getByTestId('joint-val-shoulder_pan_joint');
    expect(panVal.textContent).toContain('0.000 rad');
    expect(panVal.textContent).toContain('0.0°');
  });

  it('paints direct DOM updates in requestAnimationFrame without VDOM re-rendering', () => {
    const buffer: { current: TelemetryBuffer } = {
      current: {
        jointPositions: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        timestampNs: 0n.toString(),
        robotState: RobotState.IDLE,
        workcellState: { spawned: [], inProgress: [], processed: [], activeId: null },
        frequencyHz: 30,
        latencyMs: 12,
        lastPacketTime: performance.now(),
        frameCount: 1,
      },
    };

    let renderCount = 0;
    function Wrapper() {
      renderCount++;
      return <TelemetryMonitor bufferRef={buffer} isStreaming={true} />;
    }

    render(<Wrapper />);
    expect(renderCount).toBe(1);

    // Update mutable buffer directly (non-reactive)
    buffer.current.jointPositions = [1.571, -0.785, 0.5, -1.0, 0.25, -0.125];
    buffer.current.frequencyHz = 30;
    buffer.current.latencyMs = 15;

    // Component should NOT re-render
    expect(renderCount).toBe(1);

    // Trigger RAF paint
    act(() => {
      triggerRaf();
    });

    // Verify direct DOM was updated
    const panVal = screen.getByTestId('joint-val-shoulder_pan_joint');
    expect(panVal.textContent).toContain('1.571 rad');
    expect(panVal.textContent).toContain('90.0°');

    const liftVal = screen.getByTestId('joint-val-shoulder_lift_joint');
    expect(liftVal.textContent).toContain('-0.785 rad');
    expect(liftVal.textContent).toContain('-45.0°');

    // Verify frequency and latency readouts
    expect(screen.getByTestId('telemetry-frequency').textContent).toContain('30 Hz');
    expect(screen.getByTestId('telemetry-latency').textContent).toContain('15 ms');

    // Still no Preact re-render!
    expect(renderCount).toBe(1);
  });

  it('useTelemetryStream ingests 30 Hz frames into non-reactive buffer and updates rolling frequency and latency', () => {
    let hookResult!: ReturnType<typeof useTelemetryStream>;
    function TestComponent() {
      hookResult = useTelemetryStream();
      return <div>Test</div>;
    }

    render(<TestComponent />);

    const nowNs = BigInt(Date.now()) * 1_000_000n;
    const telem: RobotTelemetryEvent = {
      timestamp_ns: nowNs.toString(),
      robot_state: RobotState.IDLE,
      joint_positions: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
      workcell_state: { spawned: [], in_progress: [], processed: [] },
      palm_state: { is_grasped: false },
    };

    act(() => {
      const handled = hookResult.handleIncomingFrame(telem);
      expect(handled).toBe(true);
    });

    expect(hookResult.isStreaming).toBe(true);
    expect(hookResult.robotState).toBe(RobotState.IDLE);
    expect(hookResult.bufferRef.current.jointPositions).toEqual([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);
    expect(hookResult.bufferRef.current.latencyMs).toBeLessThanOrEqual(50);
  });
});
