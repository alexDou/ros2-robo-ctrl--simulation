import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/preact';
import { TeleopClient } from '@components/TeleopClient';
import { CommandType, RobotState, RobotTelemetryEvent } from '@contracts';

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
});
