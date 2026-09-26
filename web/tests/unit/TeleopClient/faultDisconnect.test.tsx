import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/preact';
import { TeleopClient } from '@components/TeleopClient';
import { RobotState } from '@contracts';

class MockWS {
  static instances: MockWS[] = [];
  url: string;
  readyState = 0;
  sentMessages: string[] = [];
  onopen: ((e: Event) => void) | null = null;
  onclose: ((e: CloseEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  constructor(url: string) { this.url = url; MockWS.instances.push(this); }
  send(d: string) { this.sentMessages.push(d); }
  close() { this.readyState = 3; this.onclose?.(new CloseEvent('close')); }
  simulateOpen() { this.readyState = 1; this.onopen?.(new Event('open')); }
  simulateMessage(d: string) { this.onmessage?.(new MessageEvent('message', { data: d })); }
}

const frame = (s: string) =>
  JSON.stringify({
    timestamp_ns: '1',
    robot_state: s,
    joint_positions: [0, 0, 0, 0, 0, 0],
    workcell_state: { spawned: [], in_progress: [], processed: [] },
    palm_state: { is_grasped: false },
  });
const errFrame = (cmd: string) =>
  JSON.stringify({
    type: 'ERROR',
    error_code: 'ACTION_FAILED',
    message: 'PickAndPlace failed: GetDropSlot rejected',
    timestamp_ns: '2',
    command_id: cmd,
  });

describe('7hbf fault surfacing', () => {
  let orig: typeof WebSocket;
  beforeEach(() => {
    MockWS.instances = [];
    orig = globalThis.WebSocket;
    // @ts-expect-error mock
    globalThis.WebSocket = MockWS;
    vi.useFakeTimers();
  });
  afterEach(() => {
    globalThis.WebSocket = orig;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('error frame surfaces command_id in banner + console.error + probe log', () => {
    const ce = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<TeleopClient robotId="robot-0" gatewayWsUrl="ws://x" />);
    fireEvent.click(screen.getByTestId('connect-button'));
    const ws = MockWS.instances[0];
    act(() => ws.simulateOpen());
    act(() => ws.simulateMessage(frame(RobotState.IDLE)));
    act(() => ws.simulateMessage(errFrame('cmd-pnp-9')));
    expect(screen.getByTestId('toolbar-error-banner').textContent).toContain('ACTION_FAILED');
    const cmdHits = ce.mock.calls.filter((c) => JSON.stringify(c).includes('cmd-pnp-9'));
    expect(cmdHits.length).toBeGreaterThan(0);
    const probeItems = screen.getAllByTestId('log-item-probe');
    expect(probeItems.some((el) => el.textContent?.includes('cmd-pnp-9'))).toBe(true);
    ce.mockRestore();
  });

  it('FAULT telemetry auto-disconnects (terminal), Connect restores', () => {
    render(<TeleopClient robotId="robot-0" gatewayWsUrl="ws://x" />);
    fireEvent.click(screen.getByTestId('connect-button'));
    const ws = MockWS.instances[0];
    act(() => ws.simulateOpen());
    act(() => ws.simulateMessage(frame(RobotState.IDLE)));
    expect(screen.getByTestId('connection-badge').textContent).toContain('CONNECTED');
    act(() => ws.simulateMessage(frame(RobotState.FAULT)));
    // Deferred one tick: FAULT renders first, then teardown.
    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.getByTestId('connection-badge').textContent).toContain('DISCONNECTED');
    fireEvent.click(screen.getByTestId('connect-button'));
    const ws2 = MockWS.instances[1];
    act(() => ws2.simulateOpen());
    act(() => ws2.simulateMessage(frame(RobotState.IDLE)));
    expect(screen.getByTestId('connection-badge').textContent).toContain('CONNECTED');
  });
});
