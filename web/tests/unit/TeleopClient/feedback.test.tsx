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
