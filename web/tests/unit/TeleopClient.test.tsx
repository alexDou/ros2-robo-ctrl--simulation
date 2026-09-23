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

    // Connect-gated: zero sockets until operator presses Connect
    expect(MockWebSocket.instances.length).toBe(0);
    expect(screen.getByTestId('connection-badge').textContent).toBe('DISCONNECTED');
    expect(screen.getByTestId('connect-button')).toBeDefined();

    fireEvent.click(screen.getByTestId('connect-button'));
    expect(screen.getByTestId('connection-badge').textContent).toMatch(/CONNECTING/i);
    expect(MockWebSocket.instances.length).toBe(1);
    expect(MockWebSocket.instances[0].url).toBe('ws://localhost:8080/ws/teleop/robot/robot-0');

    // Simulate connection established
    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });

    expect(screen.getByTestId('connection-badge').textContent).toMatch(/CONNECTED/i);
  });

  describe('Refactor-B.7: Connect-gated WebSocket lifecycle', () => {
    const telem = (state: RobotState, commandId?: string): string =>
      JSON.stringify({
        timestamp_ns: '1700000000000000000',
        robot_state: state,
        joint_positions: [0, 0, 0, 0, 0, 0],
      workcell_state: { spawned: [], in_progress: [], processed: [] },
        palm_state: { is_grasped: false },
        ...(commandId ? { command_id: commandId } : {}),
      });

    it('stays DISCONNECTED with STANDBY parked stream and zero sockets on load', () => {
      render(<TeleopClient robotId="robot-0" gatewayWsUrl="ws://localhost:8080/ws/teleop/robot/robot-0" />);
      expect(MockWebSocket.instances.length).toBe(0);
      expect(screen.getByTestId('connection-badge').textContent).toBe('DISCONNECTED');
      expect(screen.getByTestId('connect-button')).toBeDefined();
      expect(screen.getByTestId('telemetry-robot-state-badge').textContent).toBe('STANDBY');
      expect(screen.getByTestId('toolbar-disabled-reason').textContent).toMatch(/not connected/i);
    });

    it('shows BOOTING activating badge after Connect, then IDLE streaming', () => {
      render(<TeleopClient robotId="robot-0" gatewayWsUrl="ws://localhost:8080/ws/teleop/robot/robot-0" />);
      fireEvent.click(screen.getByTestId('connect-button'));
      const ws = MockWebSocket.instances[0];
      act(() => {
        ws.simulateOpen();
      });
      expect(screen.getByTestId('connection-badge').textContent).toMatch(/BOOTING.*activating/i);
      expect(screen.getByTestId('toolbar-disabled-reason').textContent).toMatch(/activating/i);
      act(() => {
        ws.simulateMessage(telem(RobotState.BOOTING));
      });
      expect(screen.getByTestId('connection-badge').textContent).toMatch(/BOOTING.*activating/i);
      act(() => {
        ws.simulateMessage(telem(RobotState.IDLE));
      });
      expect(screen.getByTestId('connection-badge').textContent).toMatch(/CONNECTED \/ IDLE/);
      expect(screen.queryByTestId('toolbar-disabled-reason')).toBeNull();
    });

    it('falls back to STANDBY display when BOOTING times out', () => {
      vi.useFakeTimers();
      try {
        render(<TeleopClient robotId="robot-0" gatewayWsUrl="ws://localhost:8080/ws/teleop/robot/robot-0" />);
        fireEvent.click(screen.getByTestId('connect-button'));
        const ws = MockWebSocket.instances[0];
        act(() => {
          ws.simulateOpen();
        });
        expect(screen.getByTestId('connection-badge').textContent).toMatch(/BOOTING/);
        act(() => {
          vi.advanceTimersByTime(10001);
        });
        expect(screen.getByTestId('connection-badge').textContent).toMatch(/STANDBY.*parked/i);
      } finally {
        vi.useRealTimers();
      }
    });

    it('Disconnect closes WS, resets stream to STANDBY, returns to Connect', () => {
      render(<TeleopClient robotId="robot-0" gatewayWsUrl="ws://localhost:8080/ws/teleop/robot/robot-0" />);
      fireEvent.click(screen.getByTestId('connect-button'));
      const ws = MockWebSocket.instances[0];
      act(() => {
        ws.simulateOpen();
      });
      act(() => {
        ws.simulateMessage(telem(RobotState.IDLE));
      });
      expect(screen.getByTestId('disconnect-button')).toBeDefined();
      fireEvent.click(screen.getByTestId('disconnect-button'));
      expect(screen.getByTestId('connection-badge').textContent).toBe('DISCONNECTED');
      expect(screen.getByTestId('telemetry-robot-state-badge').textContent).toBe('STANDBY');
      expect(MockWebSocket.instances.length).toBe(1);
      // Single toggle: back to Connect, no Reconnect variant
      expect(screen.getByTestId('connect-button')).toBeDefined();
      expect(screen.queryByTestId('disconnect-button')).toBeNull();
    });
  });

  it('defaults to arm-ur5 when robotId is omitted', () => {
    render(<TeleopClient />);
    expect(screen.getByText(/Teleop Control — arm-ur5/i)).toBeDefined();
    expect(MockWebSocket.instances.length).toBe(0);
    fireEvent.click(screen.getByTestId('connect-button'));
    expect(MockWebSocket.instances[0].url).toContain('/ws/teleop/robot/arm-ur5');
  });

  it('transmits structured PING command when clicking Ping button', () => {
    render(<TeleopClient robotId="robot-0" gatewayWsUrl="ws://localhost:8080/ws/teleop/robot/robot-0" />);
    fireEvent.click(screen.getByTestId("connect-button"));
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
    // Health probe logs an event (never silent)
    expect(screen.getByTestId('log-item-probe')).toBeDefined();
    expect(screen.getByTestId('event-log').textContent).toMatch(/PING/);
  });

  describe('Unit 6.6.4b: Ping health probe', () => {
    it('disconnected Ping probes Gateway /health and logs result (never silent no-op)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      render(<TeleopClient robotId="robot-0" gatewayWsUrl="ws://localhost:8080/ws/teleop/robot/robot-0" />);
      // Zero sockets pre-connect; Ping stays enabled
      expect(MockWebSocket.instances.length).toBe(0);
      const pingButton = screen.getByTestId('verify-connection-button');
      expect((pingButton as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(pingButton);
      expect(globalThis.fetch).toHaveBeenCalledWith('http://localhost:8080/health');
      expect(await screen.findByTestId('log-item-probe')).toBeDefined();
      expect(screen.getByTestId('event-log').textContent).toMatch(/UP|Gateway reachable/);
    });

    it('disconnected Ping logs DOWN detail when Gateway unreachable', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('fetch failed'));
      render(<TeleopClient robotId="robot-0" gatewayWsUrl="ws://localhost:8080/ws/teleop/robot/robot-0" />);
      fireEvent.click(screen.getByTestId('verify-connection-button'));
      expect(await screen.findByTestId('log-item-probe')).toBeDefined();
      expect(screen.getByTestId('event-log').textContent).toMatch(/DOWN|unreachable/);
    });
  });

  it('appends inbound RobotTelemetryEvent frames to the event log', () => {
    render(<TeleopClient robotId="robot-0" gatewayWsUrl="ws://localhost:8080/ws/teleop/robot/robot-0" />);
    fireEvent.click(screen.getByTestId("connect-button"));
    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.simulateOpen();
    });

    const telemetry: RobotTelemetryEvent = {
      timestamp_ns: 1700000000000000000n.toString(),
      robot_state: RobotState.IDLE,
      joint_positions: [0.0, 0.1, -0.2, 0.3, -0.4, 0.5],
      workcell_state: { spawned: [], in_progress: [], processed: [] },
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
    fireEvent.click(screen.getByTestId("connect-button"));
    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.simulateOpen();
    });

    // Send valid telemetry
    const telemetry: RobotTelemetryEvent = {
      timestamp_ns: 1700000000000000000n.toString(),
      robot_state: RobotState.IDLE,
      joint_positions: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
      workcell_state: { spawned: [], in_progress: [], processed: [] },
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
    fireEvent.click(screen.getByTestId("connect-button"));
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
    fireEvent.click(screen.getByTestId("connect-button"));
    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.simulateOpen();
    });

    // Before telemetry: Ping button is in the DOM
    expect(screen.queryByRole('button', { name: /ping/i })).not.toBeNull();
    expect(screen.getByTestId('connection-badge').textContent).toMatch(/CONNECTED/);

    // Inbound telemetry frame arrives
    const telemetry: RobotTelemetryEvent = {
      timestamp_ns: 1700000000000000000n.toString(),
      robot_state: RobotState.IDLE,
      joint_positions: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
      workcell_state: { spawned: [], in_progress: [], processed: [] },
      palm_state: { is_grasped: false },
    };

    act(() => {
      ws.simulateMessage(JSON.stringify(telemetry));
    });

    // Stream-aware cleanup: Ping controls are removed from DOM!
    expect(screen.queryByRole('button', { name: /ping/i })).toBeNull();
    expect(screen.getByTestId('connection-badge').textContent).toMatch(/CONNECTED \/ IDLE/);

    // TelemetryMonitor showcase is present
    expect(screen.getByTestId('telemetry-monitor')).toBeDefined();

    // When connection drops, single Connect toggle returns
    act(() => {
      ws.close();
    });
    expect(screen.getByTestId('connection-badge').textContent).toBe('DISCONNECTED');
    expect(screen.getByTestId('connect-button')).toBeDefined();
    expect(screen.queryByTestId('disconnect-button')).toBeNull();
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
    fireEvent.click(screen.getByTestId("connect-button"));
    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.simulateOpen();
    });

    const telem1: RobotTelemetryEvent = {
      timestamp_ns: 1700000000000000000n.toString(),
      robot_state: RobotState.EXECUTING,
      joint_positions: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
      workcell_state: { spawned: [], in_progress: [], processed: [] },
      palm_state: { is_grasped: false },
    };

    act(() => {
      ws.simulateMessage(JSON.stringify(telem1));
    });

    // Verify visualizer canvas and monitor are operational
    expect(screen.getByTestId('robot-visualizer')).toBeDefined();
    expect(screen.getByTestId('telemetry-monitor')).toBeDefined();
  });

  describe('Unit 4.4: Operator Toolbar & Lifecycle Controls', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('renders operator toolbar with Home pose only, no palm/E-STOP/Ready/Inspect, connect toggle in toolbar', () => {
      render(<TeleopClient robotId="robot-0" gatewayWsUrl="ws://localhost:8080/ws/teleop/robot/robot-0" />);
    fireEvent.click(screen.getByTestId("connect-button"));
    const ws = MockWebSocket.instances[0];
      act(() => {
        ws.simulateOpen();
      });

      expect(screen.getByTestId('operator-toolbar')).toBeDefined();
      expect(screen.getByTestId('pose-home-button')).toBeDefined();
      expect(screen.queryByTestId('pose-ready-button')).toBeNull();
      expect(screen.queryByTestId('pose-inspect-button')).toBeNull();
      expect(screen.queryByTestId('palm-toggle-button')).toBeNull();
      expect(screen.queryByTestId('palm-control-cluster')).toBeNull();
      expect(screen.queryByTestId('palm-status')).toBeNull();
      expect(screen.queryByTestId('emergency-stop-button')).toBeNull();
      expect(screen.queryByTestId('safety-control-cluster')).toBeNull();
      expect(screen.getByTestId('reset-fault-button')).toBeDefined();
      // Toolbar right slot now holds the single Connect/Disconnect toggle
      expect(screen.getByTestId('connection-control-cluster')).toBeDefined();
      expect(screen.getByTestId('disconnect-button')).toBeDefined();
    });

    it('dispatches TRAJECTORY_EXECUTE HOME command when clicking Home pose button', () => {
      render(<TeleopClient robotId="robot-0" gatewayWsUrl="ws://localhost:8080/ws/teleop/robot/robot-0" />);
    fireEvent.click(screen.getByTestId("connect-button"));
    const ws = MockWebSocket.instances[0];
      act(() => {
        ws.simulateOpen();
      });

      // B.7 seed: handshake complete -> IDLE enables toolbar
      act(() => {
              ws.simulateMessage(JSON.stringify({
                timestamp_ns: '1700000000000000000',
                robot_state: RobotState.IDLE,
                joint_positions: [0, 0, 0, 0, 0, 0],
      workcell_state: { spawned: [], in_progress: [], processed: [] },
                palm_state: { is_grasped: false },
              }));
            });

      // Click Home button
      const homeBtn = screen.getByTestId('pose-home-button');
      fireEvent.click(homeBtn);
      expect(ws.sentMessages.length).toBe(1);
      const sentHome = JSON.parse(ws.sentMessages[0]);
      expect(sentHome.type).toBe(CommandType.TRAJECTORY_EXECUTE);
      expect(sentHome.payload.pose_name).toBe('HOME');
    });

    it('toggles Connect/Disconnect from the toolbar right slot without bottom buttons', () => {
      render(<TeleopClient robotId="robot-0" gatewayWsUrl="ws://localhost:8080/ws/teleop/robot/robot-0" />);
      // Connect lives in toolbar right slot pre-connection
      fireEvent.click(screen.getByTestId("connect-button"));
      const ws = MockWebSocket.instances[0];
      act(() => {
        ws.simulateOpen();
      });
      // Connected: toolbar shows Disconnect, no bottom duplicate
      expect(screen.getByTestId('disconnect-button')).toBeDefined();
      expect(screen.queryByTestId('connect-button')).toBeNull();

      fireEvent.click(screen.getByTestId('disconnect-button'));
      expect(screen.getByTestId('connection-badge').textContent).toBe('DISCONNECTED');
      // Disconnected: toolbar flips back to Connect
      expect(screen.getByTestId('connect-button')).toBeDefined();
      expect(screen.queryByTestId('disconnect-button')).toBeNull();
    });

    it('enforces UI interlocks: disables Home when EXECUTING, enables Reset Fault only on FAULT', () => {
      render(<TeleopClient robotId="robot-0" gatewayWsUrl="ws://localhost:8080/ws/teleop/robot/robot-0" />);
    fireEvent.click(screen.getByTestId("connect-button"));
    const ws = MockWebSocket.instances[0];
      act(() => {
        ws.simulateOpen();
      });

      // B.7 seed: handshake complete -> IDLE enables toolbar
      act(() => {
              ws.simulateMessage(JSON.stringify({
                timestamp_ns: '1700000000000000000',
                robot_state: RobotState.IDLE,
                joint_positions: [0, 0, 0, 0, 0, 0],
      workcell_state: { spawned: [], in_progress: [], processed: [] },
                palm_state: { is_grasped: false },
              }));
            });

      // 1. Robot is EXECUTING
      const telemExecuting: RobotTelemetryEvent = {
        timestamp_ns: '1700000000000000000',
        robot_state: RobotState.EXECUTING,
        joint_positions: [0, 0, 0, 0, 0, 0],
      workcell_state: { spawned: [], in_progress: [], processed: [] },
        palm_state: { is_grasped: false },
      };
      act(() => {
        ws.simulateMessage(JSON.stringify(telemExecuting));
      });

      expect((screen.getByTestId('pose-home-button') as HTMLButtonElement).disabled).toBe(true);
      expect(screen.queryByTestId('palm-toggle-button')).toBeNull();
      expect((screen.getByTestId('reset-fault-button') as HTMLButtonElement).disabled).toBe(true);
      expect(screen.queryByTestId('emergency-stop-button')).toBeNull();

      // 2. Robot transitions to FAULT
      const telemFault: RobotTelemetryEvent = {
        timestamp_ns: '1700000000100000000',
        robot_state: RobotState.FAULT,
        joint_positions: [0, 0, 0, 0, 0, 0],
      workcell_state: { spawned: [], in_progress: [], processed: [] },
        palm_state: { is_grasped: false },
      };
      act(() => {
        ws.simulateMessage(JSON.stringify(telemFault));
      });

      expect((screen.getByTestId('pose-home-button') as HTMLButtonElement).disabled).toBe(true);
      expect(screen.queryByTestId('palm-toggle-button')).toBeNull();
      expect((screen.getByTestId('reset-fault-button') as HTMLButtonElement).disabled).toBe(false);
      expect(screen.queryByTestId('emergency-stop-button')).toBeNull();

      // Click Reset Fault
      fireEvent.click(screen.getByTestId('reset-fault-button'));
      const sentReset = JSON.parse(ws.sentMessages[ws.sentMessages.length - 1]);
      expect(sentReset.type).toBe(CommandType.RESET_FAULT);
    });

    it('displays transient 2-second error banner on inbound ErrorFrame', () => {
      render(<TeleopClient robotId="robot-0" gatewayWsUrl="ws://localhost:8080/ws/teleop/robot/robot-0" />);
    fireEvent.click(screen.getByTestId("connect-button"));
    const ws = MockWebSocket.instances[0];
      act(() => {
        ws.simulateOpen();
      });

      expect(screen.queryByTestId('toolbar-error-banner')).toBeNull();

      // Inbound ErrorFrame arrives
      const err: ErrorFrame = {
        type: 'ERROR',
        error_code: 'ROBOT_BUSY',
        message: 'Manipulator is executing motion',
        timestamp_ns: '1700000000000000000',
      };
      act(() => {
        ws.simulateMessage(JSON.stringify(err));
      });

      const banner = screen.getByTestId('toolbar-error-banner');
      expect(banner).toBeDefined();
      expect(banner.textContent).toContain('ROBOT_BUSY');
      expect(banner.textContent).toContain('Manipulator is executing motion');

      // Fast-forward 1900ms -> Still visible
      act(() => {
        vi.advanceTimersByTime(1900);
      });
      expect(screen.queryByTestId('toolbar-error-banner')).not.toBeNull();

      // Fast-forward past 2000ms -> Disappears
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(screen.queryByTestId('toolbar-error-banner')).toBeNull();
    });
  });

  describe('Unit 6.4: TeleopClient Pick-and-Place Target Dispatch & ClickLockout Lifecycle', () => {
    it('dispatches SPAWN_OBJECT command when valid reachable table spot is clicked', () => {
      render(<TeleopClient robotId="robot-0" gatewayWsUrl="ws://localhost:8080/ws/teleop/robot/robot-0" />);
    fireEvent.click(screen.getByTestId("connect-button"));
    const ws = MockWebSocket.instances[0];
      act(() => {
        ws.simulateOpen();
      });

      // B.7 seed: handshake complete -> IDLE enables toolbar
      act(() => {
              ws.simulateMessage(JSON.stringify({
                timestamp_ns: '1700000000000000000',
                robot_state: RobotState.IDLE,
                joint_positions: [0, 0, 0, 0, 0, 0],
      workcell_state: { spawned: [], in_progress: [], processed: [] },
                palm_state: { is_grasped: false },
              }));
            });

      const visualizer = (window as any).__robot_visualizer;
      expect(visualizer).toBeDefined();

      // Click reachable table spot
      act(() => {
        visualizer.simulateClick(0.5, 0.1);
      });

      expect(ws.sentMessages.length).toBe(1);
      const sentCmd = JSON.parse(ws.sentMessages[0]);
      expect(sentCmd.type).toBe(CommandType.SPAWN_OBJECT);
      expect(sentCmd.payload.x).toBeCloseTo(0.5, 2);
      expect(sentCmd.payload.y).toBeCloseTo(0.1, 2);
      expect(sentCmd.payload.z).toBeCloseTo(0.0, 2);
    });

    it('enforces client-side ClickLockout preventing second SPAWN_OBJECT command dispatch', () => {
      render(<TeleopClient robotId="robot-0" gatewayWsUrl="ws://localhost:8080/ws/teleop/robot/robot-0" />);
    fireEvent.click(screen.getByTestId("connect-button"));
    const ws = MockWebSocket.instances[0];
      act(() => {
        ws.simulateOpen();
      });

      // B.7 seed: handshake complete -> IDLE enables toolbar
      act(() => {
              ws.simulateMessage(JSON.stringify({
                timestamp_ns: '1700000000000000000',
                robot_state: RobotState.IDLE,
                joint_positions: [0, 0, 0, 0, 0, 0],
      workcell_state: { spawned: [], in_progress: [], processed: [] },
                palm_state: { is_grasped: false },
              }));
            });

      const visualizer = (window as any).__robot_visualizer;

      // Click 1
      act(() => {
        visualizer.simulateClick(0.5, 0.1);
      });
      expect(ws.sentMessages.length).toBe(1);

      // Click 2: blocked by ClickLockout
      act(() => {
        visualizer.simulateClick(0.6, 0.0);
      });
      expect(ws.sentMessages.length).toBe(1);
    });

    it('does not dispatch SPAWN_OBJECT command when robot_state is not IDLE', () => {
      render(<TeleopClient robotId="robot-0" gatewayWsUrl="ws://localhost:8080/ws/teleop/robot/robot-0" />);
    fireEvent.click(screen.getByTestId("connect-button"));
    const ws = MockWebSocket.instances[0];
      act(() => {
        ws.simulateOpen();
      });

      // Robot transitions to EXECUTING
      const telemExecuting: RobotTelemetryEvent = {
        timestamp_ns: '1700000000000000000',
        robot_state: RobotState.EXECUTING,
        joint_positions: [0, 0, 0, 0, 0, 0],
      workcell_state: { spawned: [], in_progress: [], processed: [] },
        palm_state: { is_grasped: false },
      };
      act(() => {
        ws.simulateMessage(JSON.stringify(telemExecuting));
      });

      const visualizer = (window as any).__robot_visualizer;
      // Click while busy
      act(() => {
        visualizer.simulateClick(0.5, 0.0);
      });
      expect(ws.sentMessages.length).toBe(0);
    });

    it('lifts ClickLockout automatically when robot returns to IDLE and gear has been deposited', async () => {
      render(<TeleopClient robotId="robot-0" gatewayWsUrl="ws://localhost:8080/ws/teleop/robot/robot-0" />);
    fireEvent.click(screen.getByTestId("connect-button"));
    const ws = MockWebSocket.instances[0];
      act(() => {
        ws.simulateOpen();
      });

      // B.7 seed: handshake complete -> IDLE enables toolbar
      act(() => {
              ws.simulateMessage(JSON.stringify({
                timestamp_ns: '1700000000000000000',
                robot_state: RobotState.IDLE,
                joint_positions: [0, 0, 0, 0, 0, 0],
      workcell_state: { spawned: [], in_progress: [], processed: [] },
                palm_state: { is_grasped: false },
              }));
            });

      const visualizer = (window as any).__robot_visualizer;

      // Click 1: SPAWN_OBJECT dispatched, session flag gives immediate send-guard
      act(() => {
        visualizer.simulateClick(0.5, 0.1);
      });
      expect(ws.sentMessages.length).toBe(1);

      // Snapshot echo: spawned entry appears -> visualizer lockout engages
      act(() => {
        ws.simulateMessage(JSON.stringify({
          timestamp_ns: '1700000000050000000',
          robot_state: RobotState.IDLE,
          joint_positions: [0, 0, 0, 0, 0, 0],
          workcell_state: { spawned: [{ id: 'g1', x: 0.5, y: 0.1, z: 0.0, color: 'WHITE', intact: true }], in_progress: [], processed: [] },
          palm_state: { is_grasped: false },
        }));
      });
      await act(async () => {
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      });
      expect(visualizer.isLockedOut()).toBe(true);

      // Transition to EXECUTING with in_progress bucket (grasped)
      act(() => {
        ws.simulateMessage(JSON.stringify({
          timestamp_ns: '1700000000100000000',
          robot_state: RobotState.EXECUTING,
          joint_positions: [0, 0, 0, 0, 0, 0],
          workcell_state: { spawned: [], in_progress: [{ id: 'g1', x: 0.5, y: 0.1, z: 0.0, origin_x: 0.5, origin_y: 0.1, origin_z: 0.0, color: 'WHITE', intact: true }], processed: [] },
          palm_state: { is_grasped: true },
        }));
      });
      await act(async () => {
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      });
      expect(visualizer.isLockedOut()).toBe(true);

      // Release: processed echo, robot back to IDLE -> lockout lifts (tower never locks)
      act(() => {
        ws.simulateMessage(JSON.stringify({
          timestamp_ns: '1700000000200000000',
          robot_state: RobotState.IDLE,
          joint_positions: [0, 0, 0, 0, 0, 0],
          workcell_state: { spawned: [], in_progress: [], processed: [{ id: 'g1', x: 0.4, y: -0.3, z: 0.0, origin_x: 0.5, origin_y: 0.1, origin_z: 0.0, color: 'WHITE', intact: true }] },
          palm_state: { is_grasped: false },
        }));
      });
      await act(async () => {
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      });
      expect(visualizer.isLockedOut()).toBe(false);
      expect(visualizer.getTowerGearCount()).toBe(1);

      // User can now click again to dispatch second SPAWN_OBJECT
      act(() => {
        visualizer.simulateClick(0.55, -0.05);
      });
      expect(ws.sentMessages.length).toBe(2);
      const secondCmd = JSON.parse(ws.sentMessages[1]);
      expect(secondCmd.type).toBe(CommandType.SPAWN_OBJECT);
      expect(secondCmd.payload.x).toBeCloseTo(0.55, 2);
    });

    it('auto-resets hasActiveGear to false and keeps COMPLETED progress visible when robot_state returns to IDLE', async () => {
      render(<TeleopClient robotId="robot-0" gatewayWsUrl="ws://localhost:8080/ws/teleop/robot/robot-0" />);
    fireEvent.click(screen.getByTestId("connect-button"));
    const ws = MockWebSocket.instances[0];
      act(() => {
        ws.simulateOpen();
      });

      // B.7 seed: handshake complete -> IDLE enables toolbar
      act(() => {
              ws.simulateMessage(JSON.stringify({
                timestamp_ns: '1700000000000000000',
                robot_state: RobotState.IDLE,
                joint_positions: [0, 0, 0, 0, 0, 0],
      workcell_state: { spawned: [], in_progress: [], processed: [] },
                palm_state: { is_grasped: false },
              }));
            });

      const visualizer = (window as any).__robot_visualizer;

      // 1. Click table to trigger pick-and-place target
      act(() => {
        visualizer.simulateClick(0.5, 0.1);
      });
      expect(ws.sentMessages.length).toBe(1);

      // 2. Simulate ACTION_FEEDBACK progress
      act(() => {
        ws.simulateMessage(JSON.stringify({
          type: 'ACTION_FEEDBACK',
          command_id: 'cmd-pnp-1',
          phase: 'APPROACHING',
          percent_complete: 20.0,
          timestamp_ns: '1700000000000000000',
        }));
      });
      expect(screen.queryByTestId('action-progress-container')).not.toBeNull();

      // 3. Robot state transitions to EXECUTING
      act(() => {
        ws.simulateMessage(JSON.stringify({
          timestamp_ns: '1700000000100000000',
          robot_state: RobotState.EXECUTING,
          joint_positions: [0, 0, 0, 0, 0, 0],
      workcell_state: { spawned: [], in_progress: [], processed: [] },
          palm_state: { is_grasped: true },
        }));
      });
      expect(screen.queryByTestId('action-progress-container')).not.toBeNull();

      // Flush render frames: grasp attach runs in rAF loop, then release deposits to tower
      await act(async () => {
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      });
      act(() => {
        ws.simulateMessage(JSON.stringify({
          timestamp_ns: '1700000000150000000',
          robot_state: RobotState.EXECUTING,
          joint_positions: [0, 0, 0, 0, 0, 0],
      workcell_state: { spawned: [], in_progress: [], processed: [] },
          palm_state: { is_grasped: false },
        }));
      });
      await act(async () => {
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      });

      // 4. Robot finishes sequence and transitions back to IDLE
      act(() => {
        ws.simulateMessage(JSON.stringify({
          timestamp_ns: '1700000000200000000',
          robot_state: RobotState.IDLE,
          joint_positions: [0, 0, 0, 0, 0, 0],
      workcell_state: { spawned: [], in_progress: [], processed: [] },
          palm_state: { is_grasped: false },
        }));
      });

      // COMPLETED progress stays visible across final IDLE telemetry;
      // cleared only on next pickAndPlaceTarget dispatch.
      expect(screen.queryByTestId('action-progress-container')).not.toBeNull();

      // ClickLockout is lifted
      expect(visualizer.isLockedOut()).toBe(false);

      // Able to click again for next target (dispatch clears stale progress)
      act(() => {
        visualizer.simulateClick(0.55, -0.05);
      });
      expect(ws.sentMessages.length).toBe(2);
      expect(screen.queryByTestId('action-progress-container')).toBeNull();
    });

    it('passes onSpawnObject callback prop to RobotVisualizer and invokes on table click', () => {
      const onSpawnSpy = vi.fn();
      render(
        <TeleopClient
          robotId="robot-0"
          gatewayWsUrl="ws://localhost:8080/ws/teleop/robot/robot-0"
          onSpawnObject={onSpawnSpy}
        />
      );
      fireEvent.click(screen.getByTestId("connect-button"));
      const ws = MockWebSocket.instances[0];
      act(() => {
        ws.simulateOpen();
      });

      // B.7 seed: handshake complete -> IDLE enables toolbar
      act(() => {
              ws.simulateMessage(JSON.stringify({
                timestamp_ns: '1700000000000000000',
                robot_state: RobotState.IDLE,
                joint_positions: [0, 0, 0, 0, 0, 0],
      workcell_state: { spawned: [], in_progress: [], processed: [] },
                palm_state: { is_grasped: false },
              }));
            });

      const visualizer = (window as any).__robot_visualizer;

      act(() => {
        visualizer.simulateClick(0.5, 0.1);
      });

      expect(onSpawnSpy).toHaveBeenCalledWith({
        x: expect.closeTo(0.5, 2),
        y: expect.closeTo(0.1, 2),
        z: 0.0,
        object_type: 'GEAR',
      });
    });
  });

  describe('Unit 5.4: TeleopClient Operator Toolbar Clear Workspace', () => {
    it('renders Clear Workspace button in OperatorToolbar, disabled by default when no gear is present', () => {
      render(<TeleopClient robotId="robot-0" gatewayWsUrl="ws://localhost:8080/ws/teleop/robot/robot-0" />);
    fireEvent.click(screen.getByTestId("connect-button"));
    const ws = MockWebSocket.instances[0];
      act(() => {
        ws.simulateOpen();
      });

      const clearBtn = screen.getByTestId('clear-workspace-button');
      expect(clearBtn).toBeDefined();
      expect(clearBtn.textContent).toMatch(/Clear Workspace/i);
      expect((clearBtn as HTMLButtonElement).disabled).toBe(true);

      // Verify clicking while disabled does not dispatch any command
      fireEvent.click(clearBtn);
      expect(ws.sentMessages.length).toBe(0);
    });

    it('enables Clear Workspace button when gear is spawned and robot_state is IDLE', () => {
      render(<TeleopClient robotId="robot-0" gatewayWsUrl="ws://localhost:8080/ws/teleop/robot/robot-0" />);
    fireEvent.click(screen.getByTestId("connect-button"));
    const ws = MockWebSocket.instances[0];
      act(() => {
        ws.simulateOpen();
      });

      // B.7 seed: handshake complete -> IDLE enables toolbar
      act(() => {
              ws.simulateMessage(JSON.stringify({
                timestamp_ns: '1700000000000000000',
                robot_state: RobotState.IDLE,
                joint_positions: [0, 0, 0, 0, 0, 0],
      workcell_state: { spawned: [], in_progress: [], processed: [] },
                palm_state: { is_grasped: false },
              }));
            });

      const clearBtn = screen.getByTestId('clear-workspace-button') as HTMLButtonElement;
      expect(clearBtn.disabled).toBe(true);

      const visualizer = (window as any).__robot_visualizer;
      expect(visualizer).toBeDefined();

      // Click reachable table spot to spawn gear
      act(() => {
        visualizer.simulateClick(0.5, 0.1);
      });

      expect(ws.sentMessages.length).toBe(1);
      expect(clearBtn.disabled).toBe(false);
    });

    it('dispatches CLEAR_WORKSPACE command via WebSocket when Clear Workspace button is clicked', () => {
      render(<TeleopClient robotId="robot-0" gatewayWsUrl="ws://localhost:8080/ws/teleop/robot/robot-0" />);
    fireEvent.click(screen.getByTestId("connect-button"));
    const ws = MockWebSocket.instances[0];
      act(() => {
        ws.simulateOpen();
      });

      // B.7 seed: handshake complete -> IDLE enables toolbar
      act(() => {
              ws.simulateMessage(JSON.stringify({
                timestamp_ns: '1700000000000000000',
                robot_state: RobotState.IDLE,
                joint_positions: [0, 0, 0, 0, 0, 0],
      workcell_state: { spawned: [], in_progress: [], processed: [] },
                palm_state: { is_grasped: false },
              }));
            });

      const visualizer = (window as any).__robot_visualizer;
      act(() => {
        visualizer.simulateClick(0.5, 0.1);
      });
      expect(ws.sentMessages.length).toBe(1);

      const clearBtn = screen.getByTestId('clear-workspace-button');
      act(() => {
        fireEvent.click(clearBtn);
      });

      expect(ws.sentMessages.length).toBe(2);
      const clearCmd = JSON.parse(ws.sentMessages[1]);
      expect(clearCmd.type).toBe(CommandType.CLEAR_WORKSPACE);
      expect(clearCmd.sender_id).toBe('ui-client');
      expect(clearCmd.command_id).toBeDefined();
      expect(clearCmd.timestamp_ns).toBeDefined();
      expect(clearCmd.payload).toEqual({});
    });

    it('destroys 3D gearwheel mesh in RobotVisualizer and lifts ClickLockout upon clicking Clear Workspace', async () => {
      render(<TeleopClient robotId="robot-0" gatewayWsUrl="ws://localhost:8080/ws/teleop/robot/robot-0" />);
    fireEvent.click(screen.getByTestId("connect-button"));
    const ws = MockWebSocket.instances[0];
      act(() => {
        ws.simulateOpen();
      });

      // B.7 seed: handshake complete -> IDLE enables toolbar
      act(() => {
              ws.simulateMessage(JSON.stringify({
                timestamp_ns: '1700000000000000000',
                robot_state: RobotState.IDLE,
                joint_positions: [0, 0, 0, 0, 0, 0],
      workcell_state: { spawned: [], in_progress: [], processed: [] },
                palm_state: { is_grasped: false },
              }));
            });

      const visualizer = (window as any).__robot_visualizer;

      // Spawn initial gear + snapshot echo renders mesh
      act(() => {
        visualizer.simulateClick(0.5, 0.1);
      });
      act(() => {
        ws.simulateMessage(JSON.stringify({
          timestamp_ns: '1700000000050000000',
          robot_state: RobotState.IDLE,
          joint_positions: [0, 0, 0, 0, 0, 0],
          workcell_state: { spawned: [{ id: 'g1', x: 0.5, y: 0.1, z: 0.0, color: 'WHITE', intact: true }], in_progress: [], processed: [] },
          palm_state: { is_grasped: false },
        }));
      });
      await act(async () => {
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      });
      expect(visualizer.hasActiveGear()).toBe(true);
      expect(visualizer.isLockedOut()).toBe(true);
      expect(visualizer.getGearMesh()).not.toBeNull();

      const clearBtn = screen.getByTestId('clear-workspace-button') as HTMLButtonElement;
      expect(clearBtn.disabled).toBe(false);

      // Click Clear Workspace -> CLEAR_WORKSPACE dispatched
      act(() => {
        fireEvent.click(clearBtn);
      });
      expect(JSON.parse(ws.sentMessages[ws.sentMessages.length - 1]).type).toBe(CommandType.CLEAR_WORKSPACE);

      // Backend echo: all buckets empty -> mesh destroyed, lockout lifted
      act(() => {
        ws.simulateMessage(JSON.stringify({
          timestamp_ns: '1700000000060000000',
          robot_state: RobotState.IDLE,
          joint_positions: [0, 0, 0, 0, 0, 0],
          workcell_state: { spawned: [], in_progress: [], processed: [] },
          palm_state: { is_grasped: false },
        }));
      });
      await act(async () => {
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      });

      // 3D gear destroyed and lockout lifted
      expect(visualizer.hasActiveGear()).toBe(false);
      expect(visualizer.isLockedOut()).toBe(false);
      expect(visualizer.getGearMesh()).toBeNull();
      expect(clearBtn.disabled).toBe(true);

      // Verify able to click and place a new gear
      act(() => {
        visualizer.simulateClick(0.55, -0.05);
      });
      expect(JSON.parse(ws.sentMessages[ws.sentMessages.length - 1]).type).toBe(CommandType.SPAWN_OBJECT);
    });

    it('enforces state interlocks: disables Clear Workspace button when robot_state is not IDLE', () => {
      render(<TeleopClient robotId="robot-0" gatewayWsUrl="ws://localhost:8080/ws/teleop/robot/robot-0" />);
    fireEvent.click(screen.getByTestId("connect-button"));
    const ws = MockWebSocket.instances[0];
      act(() => {
        ws.simulateOpen();
      });

      // B.7 seed: handshake complete -> IDLE enables toolbar
      act(() => {
              ws.simulateMessage(JSON.stringify({
                timestamp_ns: '1700000000000000000',
                robot_state: RobotState.IDLE,
                joint_positions: [0, 0, 0, 0, 0, 0],
      workcell_state: { spawned: [], in_progress: [], processed: [] },
                palm_state: { is_grasped: false },
              }));
            });

      const visualizer = (window as any).__robot_visualizer;

      // Spawn gear when IDLE
      act(() => {
        visualizer.simulateClick(0.5, 0.1);
      });

      const clearBtn = screen.getByTestId('clear-workspace-button') as HTMLButtonElement;
      expect(clearBtn.disabled).toBe(false);

      // Transition to EXECUTING
      const telemExecuting: RobotTelemetryEvent = {
        timestamp_ns: '1700000000000000000',
        robot_state: RobotState.EXECUTING,
        joint_positions: [0, 0, 0, 0, 0, 0],
      workcell_state: { spawned: [], in_progress: [], processed: [] },
        palm_state: { is_grasped: false },
      };
      act(() => {
        ws.simulateMessage(JSON.stringify(telemExecuting));
      });

      expect(clearBtn.disabled).toBe(true);

      // Attempting to click when disabled does not dispatch CLEAR_WORKSPACE
      act(() => {
        fireEvent.click(clearBtn);
      });
      expect(ws.sentMessages.length).toBe(1);

      // Transition to FAULT
      const telemFault: RobotTelemetryEvent = {
        timestamp_ns: '1700000000100000000',
        robot_state: RobotState.FAULT,
        joint_positions: [0, 0, 0, 0, 0, 0],
      workcell_state: { spawned: [], in_progress: [], processed: [] },
        palm_state: { is_grasped: false },
      };
      act(() => {
        ws.simulateMessage(JSON.stringify(telemFault));
      });

      expect(clearBtn.disabled).toBe(true);

      // Transition back to IDLE
      const telemIdle: RobotTelemetryEvent = {
        timestamp_ns: '1700000000200000000',
        robot_state: RobotState.IDLE,
        joint_positions: [0, 0, 0, 0, 0, 0],
      workcell_state: { spawned: [], in_progress: [], processed: [] },
        palm_state: { is_grasped: false },
      };
      act(() => {
        ws.simulateMessage(JSON.stringify(telemIdle));
      });

      expect(clearBtn.disabled).toBe(false);
    });

    it('disables Clear Workspace button when connection is dropped', () => {
      render(<TeleopClient robotId="robot-0" gatewayWsUrl="ws://localhost:8080/ws/teleop/robot/robot-0" />);
    fireEvent.click(screen.getByTestId("connect-button"));
    const ws = MockWebSocket.instances[0];
      act(() => {
        ws.simulateOpen();
      });

      // B.7 seed: handshake complete -> IDLE enables toolbar
      act(() => {
              ws.simulateMessage(JSON.stringify({
                timestamp_ns: '1700000000000000000',
                robot_state: RobotState.IDLE,
                joint_positions: [0, 0, 0, 0, 0, 0],
      workcell_state: { spawned: [], in_progress: [], processed: [] },
                palm_state: { is_grasped: false },
              }));
            });

      const visualizer = (window as any).__robot_visualizer;
      act(() => {
        visualizer.simulateClick(0.5, 0.1);
      });

      const clearBtn = screen.getByTestId('clear-workspace-button') as HTMLButtonElement;
      expect(clearBtn.disabled).toBe(false);

      // Disconnect
      act(() => {
        ws.close();
      });

      expect(clearBtn.disabled).toBe(true);
    });
  });

  describe('Unit 6.6: TeleopClient Action Feedback & Progress Bar', () => {
    it('renders and updates action progress bar upon receiving ACTION_FEEDBACK frames', () => {
      render(<TeleopClient robotId="robot-0" gatewayWsUrl="ws://localhost:8080/ws/teleop/robot/robot-0" />);
    fireEvent.click(screen.getByTestId("connect-button"));
    const ws = MockWebSocket.instances[0];
      act(() => {
        ws.simulateOpen();
      });

      // Initially, action progress bar is not rendered
      expect(screen.queryByTestId('action-progress-container')).toBeNull();

      // Ingest ACTION_FEEDBACK frame: APPROACHING 10%
      act(() => {
        ws.simulateMessage(JSON.stringify({
          type: 'ACTION_FEEDBACK',
          command_id: 'cmd-pnp-1',
          phase: 'APPROACHING',
          percent_complete: 10.0,
          timestamp_ns: '1700000000000000000',
        }));
      });

      expect(screen.getByTestId('action-progress-container')).toBeDefined();
      expect(screen.getByTestId('action-progress-phase').textContent).toContain('APPROACHING');
      expect(screen.getByTestId('action-progress-percent').textContent).toContain('10%');

      const progressBar = screen.getByTestId('action-progress-bar');
      expect(progressBar.getAttribute('aria-valuenow')).toBe('10');

      // Ingest ACTION_FEEDBACK frame: GRASPING 30%
      act(() => {
        ws.simulateMessage(JSON.stringify({
          type: 'ACTION_FEEDBACK',
          command_id: 'cmd-pnp-1',
          phase: 'GRASPING',
          percent_complete: 30.0,
          timestamp_ns: '1700000000100000000',
        }));
      });

      expect(screen.getByTestId('action-progress-phase').textContent).toContain('GRASPING');
      expect(screen.getByTestId('action-progress-percent').textContent).toContain('30%');
      expect(progressBar.getAttribute('aria-valuenow')).toBe('30');

      // Ingest ACTION_FEEDBACK frame: COMPLETED 100%
      act(() => {
        ws.simulateMessage(JSON.stringify({
          type: 'ACTION_FEEDBACK',
          command_id: 'cmd-pnp-1',
          phase: 'COMPLETED',
          percent_complete: 100.0,
          timestamp_ns: '1700000000900000000',
        }));
      });

      expect(screen.getByTestId('action-progress-phase').textContent).toContain('COMPLETED');
      expect(screen.getByTestId('action-progress-percent').textContent).toContain('100%');
      expect(progressBar.getAttribute('aria-valuenow')).toBe('100');
    });

    it('clears action progress bar upon inbound ERROR frame', () => {
      render(<TeleopClient robotId="robot-0" gatewayWsUrl="ws://localhost:8080/ws/teleop/robot/robot-0" />);
    fireEvent.click(screen.getByTestId("connect-button"));
    const ws = MockWebSocket.instances[0];
      act(() => {
        ws.simulateOpen();
      });

      act(() => {
        ws.simulateMessage(JSON.stringify({
          type: 'ACTION_FEEDBACK',
          command_id: 'cmd-pnp-2',
          phase: 'APPROACHING',
          percent_complete: 10.0,
          timestamp_ns: '1700000000000000000',
        }));
      });
      expect(screen.getByTestId('action-progress-container')).toBeDefined();

      act(() => {
        ws.simulateMessage(JSON.stringify({
          type: 'ERROR',
          error_code: 'HARDWARE_FAULT',
          message: 'Joint position limit exceeded',
          timestamp_ns: '1700000000000000000',
        }));
      });
      expect(screen.queryByTestId('action-progress-container')).toBeNull();
    });

    it('Unit 6.7.5 (border: mocked gateway): bucket walk spawned->in_progress->processed drives ride and tower', async () => {
      render(<TeleopClient robotId="robot-0" gatewayWsUrl="ws://localhost:8080/ws/teleop/robot/robot-0" />);
      fireEvent.click(screen.getByTestId('connect-button'));
      const ws = MockWebSocket.instances[0];
      act(() => {
        ws.simulateOpen();
      });

      // B.7 seed: handshake complete -> IDLE enables toolbar
      act(() => {
        ws.simulateMessage(JSON.stringify({
          timestamp_ns: '1700000000000000000',
          robot_state: RobotState.IDLE,
          joint_positions: [0, 0, 0, 0, 0, 0],
      workcell_state: { spawned: [], in_progress: [], processed: [] },
          palm_state: { is_grasped: false },
        }));
      });

      const visualizer = (window as any).__robot_visualizer;
      act(() => {
        visualizer.simulateClick(0.5, 0.1);
      });

      const telem = (workcell_state: object, grasped = false) =>
        JSON.stringify({
          timestamp_ns: '1700000000100000000',
          robot_state: RobotState.EXECUTING,
          joint_positions: [0, 0, 0, 0, 0, 0],
          workcell_state,
          palm_state: { is_grasped: grasped },
        });
      const frame = async () => {
        await act(async () => {
          await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
        });
      };

      // Spawned echo: table mesh, not attached, tower 0
      act(() => {
        ws.simulateMessage(telem({ spawned: [{ id: 'g1', x: 0.5, y: 0.1, z: 0.0, color: 'WHITE', intact: true }], in_progress: [], processed: [] }));
      });
      await frame();
      expect(visualizer.getGearMesh()).not.toBeNull();
      expect(visualizer.isGearAttached()).toBe(false);
      expect(visualizer.getTowerGearCount()).toBe(0);

      // Grasp-bit alone (no bucket move): still table mesh, no ride
      act(() => {
        ws.simulateMessage(telem({ spawned: [{ id: 'g1', x: 0.5, y: 0.1, z: 0.0, color: 'WHITE', intact: true }], in_progress: [], processed: [] }, true));
      });
      await frame();
      expect(visualizer.isGearAttached()).toBe(false);
      expect(visualizer.getTowerGearCount()).toBe(0);

      // Bucket move spawned->in_progress: flange ride, tower stays 0
      act(() => {
        ws.simulateMessage(telem({ spawned: [], in_progress: [{ id: 'g1', x: 0.5, y: 0.1, z: 0.0, origin_x: 0.5, origin_y: 0.1, origin_z: 0.0, color: 'WHITE', intact: true }], processed: [] }, true));
      });
      await frame();
      expect(visualizer.isGearAttached()).toBe(true);
      expect(visualizer.getTowerGearCount()).toBe(0);

      // Bucket move in_progress->processed: tower +1 verbatim
      act(() => {
        ws.simulateMessage(telem({ spawned: [], in_progress: [], processed: [{ id: 'g1', x: 0.4, y: -0.3, z: 0.0, origin_x: 0.5, origin_y: 0.1, origin_z: 0.0, color: 'WHITE', intact: true }] }, false));
      });
      await frame();
      expect(visualizer.isGearAttached()).toBe(false);
      expect(visualizer.getTowerGearCount()).toBe(1);
      expect(visualizer.getTowerGears()[0].position.x).toBeCloseTo(0.4, 2);
    });
  });
});




