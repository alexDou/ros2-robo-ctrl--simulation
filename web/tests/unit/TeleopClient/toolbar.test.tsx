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
});
