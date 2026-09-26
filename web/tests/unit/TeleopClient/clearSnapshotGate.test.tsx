import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/preact';
import { TeleopClient } from '@components/TeleopClient';
import { CommandType, RobotState } from '@contracts';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  readyState: number = WebSocket.CONNECTING;
  sentMessages: string[] = [];
  onopen: ((e: Event) => void) | null = null;
  onclose: ((e: CloseEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  constructor(url: string) { this.url = url; MockWebSocket.instances.push(this); }
  send(d: string) { this.sentMessages.push(d); }
  close(code = 1000, reason = 'Normal Closure') {
    this.readyState = WebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close', { code, reason }));
  }
  simulateOpen() { this.readyState = WebSocket.OPEN; this.onopen?.(new Event('open')); }
  simulateMessage(data: string) { this.onmessage?.(new MessageEvent('message', { data })); }
}

const frame = (state: RobotState, gears: boolean) => JSON.stringify({
  timestamp_ns: '1700000000000000000',
  robot_state: state,
  joint_positions: [0, 0, 0, 0, 0, 0],
  workcell_state: gears
    ? { spawned: [{ id: 'g1', x: 0.5, y: 0.1, z: 0.0, color: 'WHITE', intact: true }], in_progress: [], processed: [] }
    : { spawned: [], in_progress: [], processed: [] },
  palm_state: { is_grasped: false },
});

describe('i78q: snapshot-gated Clear Workspace', () => {
  let orig: typeof WebSocket;
  beforeEach(() => {
    MockWebSocket.instances = [];
    orig = globalThis.WebSocket;
    // @ts-expect-error mock
    globalThis.WebSocket = MockWebSocket;
  });
  afterEach(() => { globalThis.WebSocket = orig; });

  it('reload-simulated: snapshot gears + IDLE fires CLEAR_WORKSPACE without prior click', () => {
    render(<TeleopClient robotId="robot-0" gatewayWsUrl="ws://localhost:8080/ws/teleop/robot/robot-0" />);
    fireEvent.click(screen.getByTestId('connect-button'));
    const ws = MockWebSocket.instances[0];
    act(() => ws.simulateOpen());
    act(() => ws.simulateMessage(frame(RobotState.IDLE, true)));
    const btn = screen.getByTestId('clear-workspace-button') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    act(() => { fireEvent.click(btn); });
    expect(ws.sentMessages.length).toBe(1);
    expect(JSON.parse(ws.sentMessages[0]).type).toBe(CommandType.CLEAR_WORKSPACE);
  });

  it('EXECUTING with snapshot gears: no-send', () => {
    render(<TeleopClient robotId="robot-0" gatewayWsUrl="ws://localhost:8080/ws/teleop/robot/robot-0" />);
    fireEvent.click(screen.getByTestId('connect-button'));
    const ws = MockWebSocket.instances[0];
    act(() => ws.simulateOpen());
    act(() => ws.simulateMessage(frame(RobotState.EXECUTING, true)));
    const btn = screen.getByTestId('clear-workspace-button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    act(() => { fireEvent.click(btn); });
    expect(ws.sentMessages.length).toBe(0);
  });

  it('FAULT with snapshot gears: no-send (terminal, no auto-clear)', () => {
    render(<TeleopClient robotId="robot-0" gatewayWsUrl="ws://localhost:8080/ws/teleop/robot/robot-0" />);
    fireEvent.click(screen.getByTestId('connect-button'));
    const ws = MockWebSocket.instances[0];
    act(() => ws.simulateOpen());
    act(() => ws.simulateMessage(frame(RobotState.FAULT, true)));
    const btn = screen.getByTestId('clear-workspace-button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    act(() => { fireEvent.click(btn); });
    expect(ws.sentMessages.length).toBe(0);
  });
});
