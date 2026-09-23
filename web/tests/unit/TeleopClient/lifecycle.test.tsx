import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/preact';
import { TeleopClient } from '@components/TeleopClient';
import { RobotState } from '@contracts';

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
});
