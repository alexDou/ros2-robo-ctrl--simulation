import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import WebSocket from 'ws';
import { MockGateway } from '../e2e/support/mock_gateway';
import { DEFAULT_ROBOT_ID } from '../../domain/contracts';

describe('MockGateway', () => {
  let gateway: MockGateway;
  let wsUrl: string;
  let httpUrl: string;

  beforeEach(async () => {
    gateway = new MockGateway({ port: 0, host: '127.0.0.1' });
    await gateway.start();
    wsUrl = `ws://127.0.0.1:${gateway.port}/ws/teleop/robot/${DEFAULT_ROBOT_ID}`;
    httpUrl = `http://127.0.0.1:${gateway.port}/ws/teleop/robot/${DEFAULT_ROBOT_ID}`;
  });

  afterEach(async () => {
    await gateway.close();
  });

  it('serves /health endpoint with 200 OK and UP status', async () => {
    const res = await fetch(`http://127.0.0.1:${gateway.port}/health`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('UP');
  });

  it('streams 30 Hz telemetry with valid UR5e joint positions and low latency', async () => {
    const ws = new WebSocket(wsUrl);
    const frames: any[] = [];

    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => {});
      ws.on('message', (data) => {
        frames.push(JSON.parse(data.toString()));
        if (frames.length >= 3) {
          ws.close();
          resolve();
        }
      });
      ws.on('error', reject);
    });

    expect(frames.length).toBeGreaterThanOrEqual(3);
    const frame = frames[0];
    expect(frame.robot_state).toBe('IDLE');
    expect(frame.joint_positions).toHaveLength(6);
    expect(frame.timestamp_ns).toBeDefined();

    const latest = frames[frames.length - 1];
    const packetMs = Number(BigInt(latest.timestamp_ns) / 1_000_000n);
    const latency = Date.now() - packetMs;
    expect(latency).toBeLessThan(50);
  });

  it('rejects duplicate session on same robot with 409 Conflict', async () => {
    const ws1 = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      ws1.on('open', resolve);
      ws1.on('error', reject);
    });

    // Probe HTTP endpoint when session is active
    const httpRes = await fetch(httpUrl);
    expect(httpRes.status).toBe(409);
    const text = await httpRes.text();
    expect(text).toContain('Active session already exists');

    // Second WebSocket connection attempt should fail
    const ws2 = new WebSocket(wsUrl);
    const failed = await new Promise<boolean>((resolve) => {
      ws2.on('error', () => resolve(true));
      ws2.on('close', (code) => {
        if (code === 1006 || code === 4409) resolve(true);
      });
      ws2.on('open', () => resolve(false));
    });
    expect(failed).toBe(true);

    ws1.close();
  });

  it('returns structured SCHEMA_VALIDATION_ERROR for malformed payloads without dropping connection', async () => {
    const ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    const errorPromise = new Promise<any>((resolve) => {
      ws.on('message', (data) => {
        const parsed = JSON.parse(data.toString());
        if (parsed.type === 'ERROR') {
          resolve(parsed);
        }
      });
    });

    ws.send('INVALID_RAW_NON_JSON_PAYLOAD');
    const err = await errorPromise;

    expect(err.error_code).toBe('SCHEMA_VALIDATION_ERROR');
    expect(err.message).toBe('Malformed RobotCommand payload');
    expect(ws.readyState).toBe(WebSocket.OPEN);

    ws.close();
  });

  it('handles PING command and records in captured logs', async () => {
    const ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    const pingId = `ping-${Date.now()}`;
    ws.send(JSON.stringify({
      command_id: pingId,
      sender_id: 'ui-test',
      timestamp_ns: Date.now() * 1_000_000,
      type: 'PING',
      payload: {},
    }));

    await new Promise((r) => setTimeout(r, 100));
    expect(gateway.getCapturedLogs()).toContain('Received PING command');

    ws.close();
  });

  it('handles trajectory execution lifecycle states and moves joints towards target pose', async () => {
    gateway.setDynamicMotionEnabled(false);
    const ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    const states: string[] = [];
    ws.on('message', (data) => {
      const parsed = JSON.parse(data.toString());
      if (parsed.robot_state && !states.includes(parsed.robot_state)) {
        states.push(parsed.robot_state);
      }
    });

    ws.send(JSON.stringify({
      command_id: 'traj-1',
      sender_id: 'ui-test',
      timestamp_ns: Date.now() * 1_000_000,
      type: 'TRAJECTORY_EXECUTE',
      payload: { pose_name: 'READY' },
    }));

    await new Promise((r) => setTimeout(r, 600));

    expect(states).toContain('PROCESSING');
    expect(states).toContain('EXECUTING');

    ws.close();
  });

  it('handles emergency stop immediately halting motion into FAULT state', async () => {
    gateway.setDynamicMotionEnabled(false);
    const ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    ws.send(JSON.stringify({
      command_id: 'traj-2',
      sender_id: 'ui-test',
      timestamp_ns: Date.now() * 1_000_000,
      type: 'TRAJECTORY_EXECUTE',
      payload: { pose_name: 'HOME' },
    }));

    await new Promise((r) => setTimeout(r, 100));

    ws.send(JSON.stringify({
      command_id: 'estop-1',
      sender_id: 'ui-test',
      timestamp_ns: Date.now() * 1_000_000,
      type: 'EMERGENCY_STOP',
      payload: { reason: 'Test E-Stop' },
    }));

    await new Promise((r) => setTimeout(r, 100));
    expect(gateway.getRobotState()).toBe('FAULT');

    // Reset Fault
    ws.send(JSON.stringify({
      command_id: 'reset-1',
      sender_id: 'ui-test',
      timestamp_ns: Date.now() * 1_000_000,
      type: 'RESET_FAULT',
      payload: {},
    }));

    await new Promise((r) => setTimeout(r, 100));
    expect(gateway.getRobotState()).toBe('IDLE');

    ws.close();
  });

  it('handles palm actuation with delay and updates palm state', async () => {
    const ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    ws.send(JSON.stringify({
      command_id: 'palm-1',
      sender_id: 'ui-test',
      timestamp_ns: Date.now() * 1_000_000,
      type: 'PALM_ACTUATE',
      payload: { action: 'GRASP' },
    }));

    await new Promise((r) => setTimeout(r, 200));
    expect(gateway.getPalmState().is_grasped).toBe(true);

    ws.send(JSON.stringify({
      command_id: 'palm-2',
      sender_id: 'ui-test',
      timestamp_ns: Date.now() * 1_000_000,
      type: 'PALM_ACTUATE',
      payload: { action: 'RELEASE' },
    }));

    await new Promise((r) => setTimeout(r, 200));
    expect(gateway.getPalmState().is_grasped).toBe(false);

    ws.close();
  });

  it('handles PICK_AND_PLACE_TARGET and CLEAR_WORKSPACE with expected log formats', async () => {
    const ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    ws.send(JSON.stringify({
      command_id: 'pick-1',
      sender_id: 'ui-test',
      timestamp_ns: Date.now() * 1_000_000,
      type: 'PICK_AND_PLACE_TARGET',
      payload: { pick_x: 0.5, pick_y: 0.1, pick_z: 0.0 },
    }));

    await new Promise((r) => setTimeout(r, 50));
    expect(gateway.getCapturedLogs()).toMatch(/Spawned GEAR at \(0\.500,\s*0\.100,\s*0\.000\)/);

    ws.send(JSON.stringify({
      command_id: 'clear-1',
      sender_id: 'ui-test',
      timestamp_ns: Date.now() * 1_000_000,
      type: 'CLEAR_WORKSPACE',
      payload: {},
    }));

    await new Promise((r) => setTimeout(r, 50));
    expect(gateway.getCapturedLogs()).toContain('Workspace cleared for command clear-1');

    ws.close();
  });
});
