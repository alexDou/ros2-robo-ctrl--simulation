import http from 'node:http';
import { AddressInfo } from 'node:net';
import { Duplex } from 'node:stream';
import { WebSocketServer, WebSocket } from 'ws';
import {
  CANONICAL_POSES,
  RobotCommandSchema,
  type ArmJointPositions,
  type PoseName,
  type RobotState,
  type RobotTelemetryEvent,
  type ErrorFrame,
} from '../../../domain/contracts';

export interface MockGatewayOptions {
  port?: number;
  host?: string;
  onLog?: (msg: string) => void;
}

interface JointSinusoid {
  freq: number;
  amp: number;
  phase: number;
  center: number;
}

const SINUSOID_CONFIGS: JointSinusoid[] = [
  { freq: 0.11, amp: 1.20, phase: 0.0, center: 0.0 },
  { freq: 0.17, amp: 0.70, phase: Math.PI / 4, center: -1.5708 },
  { freq: 0.23, amp: 0.90, phase: Math.PI / 2, center: 1.5708 },
  { freq: 0.29, amp: 0.85, phase: 3 * Math.PI / 4, center: -1.5708 },
  { freq: 0.37, amp: 1.10, phase: Math.PI / 3, center: 0.0 },
  { freq: 0.43, amp: 1.35, phase: Math.PI / 6, center: 0.0 },
];

interface ActiveTrajectory {
  startJoints: ArmJointPositions;
  targetJoints: ArmJointPositions;
  startTime: number;
  durationMs: number;
}

export class MockGateway {
  public port: number;
  public readonly host: string;

  private server: http.Server;
  private wss: WebSocketServer;
  private activeSessions = new Map<string, WebSocket>();
  private logs: string[] = [];
  private onLog?: (msg: string) => void;

  private robotState: RobotState = 'IDLE';
  private palmState: { is_grasped: boolean } = { is_grasped: false };
  private currentJoints: ArmJointPositions = [...CANONICAL_POSES.HOME];

  private dynamicMotionEnabled = true;
  private motionStartTime: number = Date.now();
  private timer: NodeJS.Timeout | null = null;
  private activeTrajectory: ActiveTrajectory | null = null;
  private processingTimeout: NodeJS.Timeout | null = null;
  private palmTimeout: NodeJS.Timeout | null = null;

  constructor(options: MockGatewayOptions = {}) {
    this.port = options.port ?? 8085;
    this.host = options.host ?? '127.0.0.1';
    this.onLog = options.onLog;

    this.server = http.createServer((req, res) => this.handleHttpRequest(req, res));
    this.wss = new WebSocketServer({ noServer: true });

    this.server.on('upgrade', (req, socket, head) => this.handleUpgrade(req, socket, head));
  }

  public log(msg: string): void {
    this.logs.push(msg);
    if (this.onLog) {
      this.onLog(msg);
    }
  }

  public getCapturedLogs(): string {
    return this.logs.join('\n');
  }

  public clearCapturedLogs(): void {
    this.logs.length = 0;
  }

  public isDynamicMotionEnabled(): boolean {
    return this.dynamicMotionEnabled;
  }

  public setDynamicMotionEnabled(enabled: boolean): void {
    this.dynamicMotionEnabled = enabled;
    if (enabled) {
      this.motionStartTime = Date.now();
    } else {
      this.cancelTrajectory();
      if (this.robotState !== 'FAULT') {
        this.currentJoints = [...CANONICAL_POSES.HOME];
        this.robotState = 'IDLE';
      }
    }
  }

  public reset(): void {
    this.cancelTrajectory();
    if (this.palmTimeout) {
      clearTimeout(this.palmTimeout);
      this.palmTimeout = null;
    }
    this.robotState = 'IDLE';
    this.palmState = { is_grasped: false };
    this.currentJoints = [...CANONICAL_POSES.HOME];
    this.clearCapturedLogs();
  }

  public getRobotState(): RobotState {
    return this.robotState;
  }

  public getPalmState(): { is_grasped: boolean } {
    return { ...this.palmState };
  }

  public getJointPositions(): ArmJointPositions {
    return [...this.currentJoints];
  }

  public async start(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => {
        this.server.off('listening', onListening);
        reject(err);
      };
      const onListening = () => {
        this.server.off('error', onError);
        const addr = this.server.address() as AddressInfo | null;
        if (addr && typeof addr === 'object') {
          this.port = addr.port;
        }
        resolve();
      };
      this.server.once('error', onError);
      this.server.once('listening', onListening);
      this.server.listen(this.port, this.host);
    });

    this.startTickLoop();
  }

  public async close(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.cancelTrajectory();
    if (this.palmTimeout) {
      clearTimeout(this.palmTimeout);
      this.palmTimeout = null;
    }

    for (const ws of this.wss.clients) {
      try {
        ws.terminate();
      } catch {}
    }
    this.activeSessions.clear();

    if (typeof (this.server as any).closeAllConnections === 'function') {
      (this.server as any).closeAllConnections();
    }

    await Promise.all([
      new Promise<void>((resolve) => this.wss.close(() => resolve())),
      new Promise<void>((resolve) => this.server.close(() => resolve())),
    ]);
  }

  private handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host || 'localhost'}`);

    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'UP' }));
      return;
    }

    const match = url.pathname.match(/^\/ws\/teleop\/robot\/([^/?]+)/);
    if (match) {
      const robotId = match[1];
      const existing = this.activeSessions.get(robotId);
      if (existing && existing.readyState === WebSocket.OPEN) {
        res.writeHead(409, { 'Content-Type': 'text/plain' });
        res.end('Active session already exists for robot');
        return;
      }
      res.writeHead(426, { 'Content-Type': 'text/plain' });
      res.end('Upgrade Required');
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }

  private handleUpgrade(req: http.IncomingMessage, socket: Duplex, head: Buffer): void {
    const url = new URL(req.url ?? '/', `http://${req.headers.host || 'localhost'}`);
    const match = url.pathname.match(/^\/ws\/teleop\/robot\/([^/?]+)/);
    if (!match) {
      socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      return;
    }

    const robotId = match[1];
    const existing = this.activeSessions.get(robotId);
    if (existing && existing.readyState === WebSocket.OPEN) {
      socket.end(
        'HTTP/1.1 409 Conflict\r\n' +
        'Content-Type: text/plain\r\n' +
        'Connection: close\r\n\r\n' +
        'Active session already exists for robot\r\n'
      );
      return;
    }

    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.activeSessions.set(robotId, ws);

      ws.on('close', () => {
        if (this.activeSessions.get(robotId) === ws) {
          this.activeSessions.delete(robotId);
        }
      });

      ws.on('message', (raw: Buffer | string) => {
        this.handleIncomingMessage(ws, robotId, raw);
      });

      // Send initial frame
      this.sendTelemetry(ws, robotId);
    });
  }

  private handleIncomingMessage(ws: WebSocket, robotId: string, raw: Buffer | string): void {
    const str = raw.toString();
    let cmd: unknown;
    try {
      cmd = JSON.parse(str);
    } catch {
      const errFrame: ErrorFrame = {
        type: 'ERROR',
        error_code: 'SCHEMA_VALIDATION_ERROR',
        message: 'Malformed RobotCommand payload',
        timestamp_ns: (BigInt(Date.now()) * 1_000_000n).toString(),
      };
      ws.send(JSON.stringify(errFrame));
      return;
    }

    const parseResult = RobotCommandSchema.safeParse(cmd);
    if (!parseResult.success) {
      const errFrame: ErrorFrame = {
        type: 'ERROR',
        error_code: 'SCHEMA_VALIDATION_ERROR',
        message: 'Malformed RobotCommand payload',
        timestamp_ns: (BigInt(Date.now()) * 1_000_000n).toString(),
      };
      ws.send(JSON.stringify(errFrame));
      return;
    }

    this.executeCommand(ws, robotId, parseResult.data);
  }

  private executeCommand(ws: WebSocket, robotId: string, cmd: any): void {
    switch (cmd.type) {
      case 'PING': {
        this.log(`[EDGE] Received PING command: ${cmd.command_id || ''}`);
        this.sendTelemetry(ws, robotId, cmd.command_id);
        break;
      }

      case 'TRAJECTORY_EXECUTE': {
        if (this.robotState === 'FAULT') {
          this.log('[EDGE] Trajectory execution rejected: robot in FAULT state');
          break;
        }
        this.log(`[EDGE] Received TRAJECTORY_EXECUTE command: ${cmd.command_id || ''}`);
        this.cancelTrajectory();

        const poseName = (cmd.payload?.pose_name as PoseName) ?? 'READY';
        const target = CANONICAL_POSES[poseName] ?? CANONICAL_POSES.READY;

        this.robotState = 'PROCESSING';
        this.sendTelemetryToAll(cmd.command_id);

        this.processingTimeout = setTimeout(() => {
          this.processingTimeout = null;
          if (this.robotState === 'PROCESSING') {
            this.robotState = 'EXECUTING';
            this.activeTrajectory = {
              startJoints: [...this.currentJoints],
              targetJoints: [...target],
              startTime: Date.now(),
              durationMs: 800,
            };
            this.sendTelemetryToAll();
          }
        }, 100);
        break;
      }

      case 'EMERGENCY_STOP': {
        this.log('[EDGE] Received EMERGENCY_STOP command');
        this.cancelTrajectory();
        if (this.palmTimeout) {
          clearTimeout(this.palmTimeout);
          this.palmTimeout = null;
        }
        this.robotState = 'FAULT';
        this.sendTelemetryToAll(cmd.command_id);
        break;
      }

      case 'RESET_FAULT': {
        this.log('[EDGE] Received RESET_FAULT command');
        this.cancelTrajectory();
        this.robotState = 'IDLE';
        this.sendTelemetryToAll(cmd.command_id);
        break;
      }

      case 'PALM_ACTUATE': {
        if (this.robotState === 'FAULT') {
          this.log('[EDGE] Palm actuation rejected: robot in FAULT state');
          break;
        }
        this.log(`[EDGE] Received PALM_ACTUATE command: ${cmd.command_id || ''}`);
        const isGrasp = cmd.payload?.action === 'GRASP';
        if (this.palmTimeout) {
          clearTimeout(this.palmTimeout);
        }
        this.palmTimeout = setTimeout(() => {
          this.palmTimeout = null;
          this.palmState = { is_grasped: isGrasp };
          this.sendTelemetryToAll(cmd.command_id);
        }, 100);
        break;
      }

      case 'PICK_AND_PLACE_TARGET': {
        if (this.robotState === 'FAULT') {
          this.log('[EDGE] Pick and place rejected: robot in FAULT state');
          break;
        }
        const x = Number(cmd.payload?.pick_x ?? 0.5);
        const y = Number(cmd.payload?.pick_y ?? 0.0);
        this.log(`[EDGE] Spawned GEAR at (${x.toFixed(3)}, ${y.toFixed(3)}, 0.000)`);
        this.sendTelemetryToAll(cmd.command_id);
        break;
      }

      case 'CLEAR_WORKSPACE': {
        if (this.robotState === 'FAULT') {
          this.log('[EDGE] Clear workspace rejected: robot in FAULT state');
          break;
        }
        this.log(`[EDGE] Workspace cleared for command ${cmd.command_id || ''}`);
        this.sendTelemetryToAll(cmd.command_id);
        break;
      }

      default: {
        this.log(`[EDGE] Received unknown command type: ${cmd.type}`);
        this.sendTelemetryToAll(cmd.command_id);
        break;
      }
    }
  }

  private cancelTrajectory(): void {
    if (this.processingTimeout) {
      clearTimeout(this.processingTimeout);
      this.processingTimeout = null;
    }
    this.activeTrajectory = null;
  }

  private startTickLoop(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.tick();
    }, 33);
  }

  private tick(): void {
    if (this.robotState === 'FAULT') {
      // Safety invariant: all motion frozen in FAULT state
      this.sendTelemetryToAll();
      return;
    }

    if (this.dynamicMotionEnabled) {
      this.updateDynamicJoints();
    } else if (this.activeTrajectory) {
      this.updateTrajectory();
    }
    this.sendTelemetryToAll();
  }

  private updateDynamicJoints(): void {
    const t = (Date.now() - this.motionStartTime) / 1000;
    for (let i = 0; i < 6; i++) {
      const cfg = SINUSOID_CONFIGS[i];
      const angle = cfg.center + cfg.amp * Math.sin(2 * Math.PI * cfg.freq * t + cfg.phase);
      this.currentJoints[i] = Math.max(-Math.PI, Math.min(Math.PI, angle));
    }
  }

  private updateTrajectory(): void {
    if (!this.activeTrajectory) return;
    const { startJoints, targetJoints, startTime, durationMs } = this.activeTrajectory;
    const elapsed = Date.now() - startTime;
    const t = Math.min(1.0, Math.max(0.0, elapsed / durationMs));
    // Smooth step easing
    const alpha = t * t * (3 - 2 * t);
    for (let i = 0; i < 6; i++) {
      this.currentJoints[i] = startJoints[i] + (targetJoints[i] - startJoints[i]) * alpha;
    }
    if (t >= 1.0) {
      this.currentJoints = [...targetJoints];
      this.robotState = 'IDLE';
      this.activeTrajectory = null;
    }
  }

  private sendTelemetryToAll(commandId?: string): void {
    for (const [robotId, ws] of this.activeSessions.entries()) {
      if (ws.readyState === WebSocket.OPEN) {
        this.sendTelemetry(ws, robotId, commandId);
      }
    }
  }

  private sendTelemetry(ws: WebSocket, _robotId: string, commandId?: string): void {
    const now = Date.now();
    const event: RobotTelemetryEvent = {
      timestamp_ns: (BigInt(now) * 1_000_000n).toString(),
      robot_state: this.robotState,
      joint_positions: [...this.currentJoints] as ArmJointPositions,
      palm_state: { ...this.palmState },
      command_id: commandId ?? null,
    };
    try {
      ws.send(JSON.stringify(event));
    } catch {}
  }
}
