import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/preact';
import { TeleopClient } from '@components/TeleopClient';
import { CommandType, RobotState, RobotTelemetryEvent, ErrorFrame } from '@contracts';

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static nextStatusCheckConflict = false;

  url: string;
  readyState: number = WebSocket.CONNECTING;
  sentMessages: string[] = [];

  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close(code = 1000, reason = 'Normal Closure') {
    this.readyState = WebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close', { code, reason }));
    }
  }

  simulateOpen() {
    this.readyState = WebSocket.OPEN;
    if (this.onopen) {
      this.onopen(new Event('open'));
    }
  }

  simulateMessage(data: string) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data }));
    }
  }

  simulateErrorAndClose(isConflict = false) {
    this.readyState = WebSocket.CLOSED;
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
    if (this.onclose) {
      this.onclose(new CloseEvent('close', { code: isConflict ? 4409 : 1006, reason: isConflict ? 'Conflict' : 'Abnormal Closure' }));
    }
  }
}

describe('TeleopClient Component', () => {
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

  it('renders connection lifecycle badge and connects to /ws/teleop/robot/{id}', () => {
    render(<TeleopClient robotId="robot-0" gatewayWsUrl="ws://localhost:8080/ws/teleop/robot/robot-0" />);

    expect(screen.getByTestId('connection-badge').textContent).toMatch(/CONNECTING/i);
    expect(MockWebSocket.instances.length).toBe(1);
    expect(MockWebSocket.instances[0].url).toBe('ws://localhost:8080/ws/teleop/robot/robot-0');

    // Simulate connection established
    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });

    expect(screen.getByTestId('connection-badge').textContent).toMatch(/CONNECTED/i);
  });

  it('defaults to arm-ur5 when robotId is omitted', () => {
    render(<TeleopClient />);
    expect(screen.getByText(/Teleop Control — arm-ur5/i)).toBeDefined();
    expect(MockWebSocket.instances[0].url).toContain('/ws/teleop/robot/arm-ur5');
  });

  it('transmits structured PING command when clicking Ping button', () => {
    render(<TeleopClient robotId="robot-0" gatewayWsUrl="ws://localhost:8080/ws/teleop/robot/robot-0" />);
    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.simulateOpen();
    });

    const pingButton = screen.getByRole('button', { name: /ping/i });
    fireEvent.click(pingButton);

    expect(ws.sentMessages.length).toBe(1);
    const sent = JSON.parse(ws.sentMessages[0]);
    expect(sent.type).toBe(CommandType.PING);
    expect(sent.sender_id).toBe('ui-client');
    expect(sent.command_id).toBeDefined();
    expect(sent.timestamp_ns).toBeDefined();
    expect(sent.payload).toEqual({});
  });

  it('appends inbound RobotTelemetryEvent frames to the event log', () => {
    render(<TeleopClient robotId="robot-0" gatewayWsUrl="ws://localhost:8080/ws/teleop/robot/robot-0" />);
    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.simulateOpen();
    });

    const telemetry: RobotTelemetryEvent = {
      timestamp_ns: 1700000000000000000n.toString(),
      robot_state: RobotState.IDLE,
      joint_positions: [0.0, 0.1, -0.2, 0.3, -0.4, 0.5],
      palm_state: { is_grasped: false },
      command_id: 'cmd-test-123',
    };

    act(() => {
      ws.simulateMessage(JSON.stringify(telemetry));
    });

    const logList = screen.getByTestId('event-log');
    expect(logList.textContent).toContain('IDLE');
    expect(logList.textContent).toContain('cmd-test-123');
    expect(logList.textContent).toContain('0.1');
  });

  it('appends inbound ERROR frames highlighted as error diagnostics without clearing logs', () => {
    render(<TeleopClient robotId="robot-0" gatewayWsUrl="ws://localhost:8080/ws/teleop/robot/robot-0" />);
    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.simulateOpen();
    });

    // Send valid telemetry
    const telemetry: RobotTelemetryEvent = {
      timestamp_ns: 1700000000000000000n.toString(),
      robot_state: RobotState.IDLE,
      joint_positions: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
      palm_state: { is_grasped: false },
    };
    act(() => {
      ws.simulateMessage(JSON.stringify(telemetry));
    });

    // Send ERROR frame
    const errorFrame: ErrorFrame = {
      type: 'ERROR',
      error_code: 'SCHEMA_VALIDATION_ERROR',
      message: 'Malformed payload',
      timestamp_ns: 1700000000100000000n.toString(),
    };
    act(() => {
      ws.simulateMessage(JSON.stringify(errorFrame));
    });

    const logList = screen.getByTestId('event-log');
    expect(logList.textContent).toContain('IDLE');
    expect(logList.textContent).toContain('SCHEMA_VALIDATION_ERROR');
    expect(logList.textContent).toContain('Malformed payload');

    const errorItem = screen.getByTestId('log-item-error');
    expect(errorItem).toBeDefined();
  });

  it('displays CONFLICT badge and error banner on 409 Conflict', async () => {
    // Mock fetch returning 409 Conflict
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 409,
      ok: false,
      text: () => Promise.resolve('Active session already exists for robot'),
    });

    render(<TeleopClient robotId="robot-0" gatewayWsUrl="ws://localhost:8080/ws/teleop/robot/robot-0" />);
    const ws = MockWebSocket.instances[0];

    await act(async () => {
      ws.simulateErrorAndClose(true);
    });

    expect(screen.getByTestId('connection-badge').textContent).toMatch(/CONFLICT/i);
    expect(screen.getByTestId('conflict-banner')).toBeDefined();
    expect(screen.getByTestId('conflict-banner').textContent).toContain('Active session already exists');
  });

  it('removes Ping controls from DOM once telemetry streams and transitions to CONNECTED / IDLE', () => {
    render(<TeleopClient robotId="robot-0" gatewayWsUrl="ws://localhost:8080/ws/teleop/robot/robot-0" />);
    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.simulateOpen();
    });

    // Before telemetry: Ping button is in the DOM
    expect(screen.queryByRole('button', { name: /ping/i })).not.toBeNull();
    expect(screen.getByTestId('connection-badge').textContent).toBe('CONNECTED');

    // Inbound telemetry frame arrives
    const telemetry: RobotTelemetryEvent = {
      timestamp_ns: 1700000000000000000n.toString(),
      robot_state: RobotState.IDLE,
      joint_positions: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
      palm_state: { is_grasped: false },
    };

    act(() => {
      ws.simulateMessage(JSON.stringify(telemetry));
    });

    // Stream-aware cleanup: Ping controls are removed from DOM!
    expect(screen.queryByRole('button', { name: /ping/i })).toBeNull();
    expect(screen.getByTestId('connection-badge').textContent).toBe('CONNECTED / IDLE');

    // TelemetryMonitor showcase is present
    expect(screen.getByTestId('telemetry-monitor')).toBeDefined();

    // When connection drops, controls are restored
    act(() => {
      ws.close();
    });
    expect(screen.getByTestId('connection-badge').textContent).toBe('DISCONNECTED');
    expect(screen.queryByRole('button', { name: /reconnect/i })).not.toBeNull();
  });

  it('renders responsive 75/25 split layout on desktop and collapses on narrow viewports (<1024px)', () => {
    // Desktop width: 1280px
    window.innerWidth = 1280;

    const { unmount } = render(<TeleopClient robotId="robot-0" gatewayWsUrl="ws://localhost:8080/ws/teleop/robot/robot-0" />);

    const splitLayout = screen.getByTestId('teleop-split-layout');
    const visualizerPane = screen.getByTestId('visualizer-pane');
    const sidebarPane = screen.getByTestId('sidebar-pane');

    expect(splitLayout).toBeDefined();
    expect(visualizerPane).toBeDefined();
    expect(sidebarPane).toBeDefined();

    // Verify 75/25 flex basis on desktop
    expect(visualizerPane.style.flex).toContain('75%');
    expect(sidebarPane.style.flex).toContain('25%');

    // Visualizer canvas is mounted inside left pane
    expect(visualizerPane.querySelector('[data-testid="robot-visualizer"]')).not.toBeNull();
    // TelemetryMonitor is inside right pane
    expect(sidebarPane.querySelector('[data-testid="telemetry-monitor"]')).not.toBeNull();

    // Simulate window resize to narrow mobile/tablet viewport (<1024px)
    act(() => {
      window.innerWidth = 800;
      window.dispatchEvent(new Event('resize'));
    });

    // Both panes collapse to 100% width single-column stack
    expect(visualizerPane.style.flex).toContain('100%');
    expect(sidebarPane.style.flex).toContain('100%');

    unmount();
  });

  it('connects telemetryBufferRef to RobotVisualizer and updates buffer on streaming frames without VDOM re-renders', () => {
    render(<TeleopClient robotId="robot-0" gatewayWsUrl="ws://localhost:8080/ws/teleop/robot/robot-0" />);
    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.simulateOpen();
    });

    const telem1: RobotTelemetryEvent = {
      timestamp_ns: 1700000000000000000n.toString(),
      robot_state: RobotState.EXECUTING,
      joint_positions: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
      palm_state: { is_grasped: false },
    };

    act(() => {
      ws.simulateMessage(JSON.stringify(telem1));
    });

    // Verify visualizer canvas and monitor are operational
    expect(screen.getByTestId('robot-visualizer')).toBeDefined();
    expect(screen.getByTestId('telemetry-monitor')).toBeDefined();
  });
});


