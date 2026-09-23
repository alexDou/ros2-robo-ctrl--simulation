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
});
