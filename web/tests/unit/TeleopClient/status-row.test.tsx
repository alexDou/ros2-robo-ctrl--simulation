import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/preact';
import { TeleopClient } from '@components/TeleopClient';
import { RobotState } from '@contracts';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  readyState: number = WebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }
  send() {}
  close() {
    this.readyState = WebSocket.CLOSED;
  }
  simulateOpen() {
    this.readyState = WebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }
  simulateMessage(data: string) {
    this.onmessage?.(new MessageEvent('message', { data }));
  }
}

const telem = (state: RobotState): string =>
  JSON.stringify({
    timestamp_ns: '1700000000000000000',
    robot_state: state,
    joint_positions: [0, 0, 0, 0, 0, 0],
    workcell_state: { spawned: [], in_progress: [], processed: [] },
    palm_state: { is_grasped: false },
  });

const feedback = (percent: number): string =>
  JSON.stringify({
    type: 'ACTION_FEEDBACK',
    command_id: 'cmd-pnp-1',
    phase: 'APPROACHING',
    percent_complete: percent,
    timestamp_ns: '1700000000000000000',
  });

describe('Action status row (robot-state message + progress, above the workspace)', () => {
  let originalWebSocket: typeof WebSocket;

  beforeEach(() => {
    MockWebSocket.instances = [];
    originalWebSocket = globalThis.WebSocket;
    // @ts-expect-error Mocking WebSocket
    globalThis.WebSocket = MockWebSocket;
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
    vi.restoreAllMocks();
  });

  const renderClient = () =>
    render(
      <TeleopClient robotId="robot-0" gatewayWsUrl="ws://localhost:8080/ws/teleop/robot/robot-0" />,
    );

  const connect = () => {
    fireEvent.click(screen.getByTestId('connect-button'));
    const ws = MockWebSocket.instances[0];
    act(() => ws.simulateOpen());
    return ws;
  };

  it('sits in the visualizer pane above the canvas and the toolbar', () => {
    renderClient();
    const row = screen.getByTestId('action-status-row');
    const pane = screen.getByTestId('visualizer-pane');
    expect(pane.contains(row)).toBe(true);
    expect(pane.firstElementChild).toBe(row);
    const toolbar = screen.getByTestId('operator-toolbar');
    expect(row.compareDocumentPosition(toolbar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('moves the robot-state message out of the toolbar into the row (left)', () => {
    renderClient();
    const row = screen.getByTestId('action-status-row');
    const message = screen.getByTestId('toolbar-disabled-reason');
    expect(row.contains(message)).toBe(true);
    expect(screen.getByTestId('operator-toolbar').contains(message)).toBe(false);
    expect(message.textContent).toMatch(/not connected/i);
  });

  it('puts the message left and the progress bar right in a flex row', () => {
    renderClient();
    const ws = connect();
    act(() => ws.simulateMessage(telem(RobotState.EXECUTING)));
    act(() => ws.simulateMessage(feedback(40)));
    const row = screen.getByTestId('action-status-row');
    expect(row.style.display).toBe('flex');
    const message = screen.getByTestId('toolbar-disabled-reason');
    const progress = screen.getByTestId('action-progress-container');
    expect(row.contains(progress)).toBe(true);
    expect(
      message.compareDocumentPosition(progress) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('reserves a fixed height so the row never shifts between states', () => {
    renderClient();
    const heights = new Set<string>();
    const record = () => {
      const { height, minHeight } = screen.getByTestId('action-status-row').style;
      expect(height).not.toBe('');
      expect(minHeight).toBe(height);
      heights.add(height);
    };
    record(); // disconnected: message only
    const ws = connect();
    act(() => ws.simulateMessage(telem(RobotState.IDLE)));
    record(); // idle: nothing to show
    expect(screen.queryByTestId('toolbar-disabled-reason')).toBeNull();
    act(() => ws.simulateMessage(telem(RobotState.EXECUTING)));
    act(() => ws.simulateMessage(feedback(10)));
    record(); // executing: message + progress
    expect(heights.size).toBe(1);
  });
});
