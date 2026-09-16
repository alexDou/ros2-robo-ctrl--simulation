import { spawn, execSync, ChildProcess } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_ROBOT_ID } from '../../../domain/contracts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../../');
const WEB_DIR = path.resolve(ROOT_DIR, 'web');

export interface HarnessConfig {
  gatewayPort?: number;
  webPort?: number;
  robotId?: string;
  publisherScript?: string;
  publishRateHz?: number;
}

export class ServiceHarness {
  public readonly gatewayPort: number;
  public readonly webPort: number;
  public readonly robotId: string;
  public readonly baseUrl: string;
  public readonly publisherScript: string;
  public readonly publishRateHz: number;

  private gatewayProcess: ChildProcess | null = null;
  private edgeNodeProcess: ChildProcess | null = null;
  private mockPublisherProcess: ChildProcess | null = null;
  private webProcess: ChildProcess | null = null;

  public readonly edgeNodeLogs: string[] = [];

  constructor(config: HarnessConfig = {}) {
    this.gatewayPort = config.gatewayPort ?? Number(process.env.E2E_GATEWAY_PORT || 8085);
    this.webPort = config.webPort ?? Number(process.env.E2E_WEB_PORT || 3005);
    this.robotId = config.robotId ?? DEFAULT_ROBOT_ID;
    this.publisherScript =
      config.publisherScript ??
      process.env.E2E_PUBLISHER_SCRIPT ??
      'src/edge_node/mock_motion_publisher.py';
    this.publishRateHz = config.publishRateHz ?? 30.0;
    this.baseUrl = `http://127.0.0.1:${this.webPort}/?robot_id=${this.robotId}&gateway_port=${this.gatewayPort}`;
  }

  private cleanStalePorts(): void {
    try {
      execSync(`fuser -k ${this.gatewayPort}/tcp ${this.webPort}/tcp 2>/dev/null || true`);
    } catch {
      // Ignore if fuser is unavailable or no processes killed
    }
  }

  private async pollHttp(url: string, maxAttempts = 60, delayMs = 100): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const statusCode = await new Promise<number>((resolve, reject) => {
          const req = http.get(url, (res) => {
            resolve(res.statusCode ?? 0);
          });
          req.on('error', reject);
          req.setTimeout(500, () => {
            req.destroy();
            reject(new Error('timeout'));
          });
        });

        if (statusCode >= 200 && statusCode < 400) {
          return;
        }
      } catch {
        // Retry
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
    throw new Error(`Health check timed out waiting for ${url}`);
  }

  public async start(): Promise<void> {
    this.cleanStalePorts();

    // 1. Ensure gateway binary exists and is up to date
    execSync('cargo build -p gateway', { cwd: ROOT_DIR, stdio: 'inherit' });

    // 2. Start Gateway
    this.gatewayProcess = spawn(path.join(ROOT_DIR, 'target/debug/gateway'), [], {
      cwd: ROOT_DIR,
      env: {
        ...process.env,
        GATEWAY_HOST: '127.0.0.1',
        GATEWAY_PORT: String(this.gatewayPort),
        RUST_LOG: 'info',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.gatewayProcess.stderr?.on('data', (d: Buffer) => {
      const msg = d.toString();
      if (process.env.DEBUG_E2E) process.stderr.write(`[GW] ${msg}`);
    });

    // 3. Start EdgeNode
    this.edgeNodeProcess = spawn('uv', ['run', 'python', 'src/edge_node/main.py'], {
      cwd: ROOT_DIR,
      env: {
        ...process.env,
        ROBOT_ID: this.robotId,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const recordEdgeLog = (data: Buffer) => {
      const text = data.toString();
      this.edgeNodeLogs.push(text);
      if (process.env.DEBUG_E2E) process.stdout.write(`[EDGE] ${text}`);
    };
    this.edgeNodeProcess.stdout?.on('data', recordEdgeLog);
    this.edgeNodeProcess.stderr?.on('data', recordEdgeLog);

    // 3b. Start Mock Motion Publisher at 30 Hz
    await this.startMockPublisher();

    // 4. Start Vite web server
    this.webProcess = spawn('npm', ['run', 'dev', '--', '--port', String(this.webPort), '--strictPort'], {
      cwd: WEB_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.webProcess.stderr?.on('data', (d: Buffer) => {
      if (process.env.DEBUG_E2E) process.stderr.write(`[VITE] ${d.toString()}`);
    });

    // 5. Await health checks
    await Promise.all([
      this.pollHttp(`http://127.0.0.1:${this.gatewayPort}/health`),
      this.pollHttp(`http://127.0.0.1:${this.webPort}/`),
    ]);

    // Wait for Zenoh peer discovery to establish between Gateway and EdgeNode
    await new Promise((r) => setTimeout(r, 1500));
  }

  public getCapturedLogs(): string {
    return this.edgeNodeLogs.join('');
  }

  public clearCapturedLogs(): void {
    this.edgeNodeLogs.length = 0;
  }

  public isMockPublisherRunning(): boolean {
    return (
      this.mockPublisherProcess !== null &&
      !this.mockPublisherProcess.killed &&
      this.mockPublisherProcess.exitCode === null
    );
  }

  public async startMockPublisher(): Promise<void> {
    if (this.isMockPublisherRunning()) return;

    const isMockMotion = this.publisherScript.includes('mock_motion_publisher');
    const publisherArgs = isMockMotion
      ? [
          'run',
          'python',
          this.publisherScript,
          '--rate',
          String(this.publishRateHz),
          '--topic',
          '/joint_states',
          '--robot-id',
          this.robotId,
          '--no-zenoh',
        ]
      : [
          'run',
          'python',
          this.publisherScript,
          '--rate',
          String(this.publishRateHz),
          '--topic',
          '/joint_states',
        ];

    this.mockPublisherProcess = spawn('uv', publisherArgs, {
      cwd: ROOT_DIR,
      env: {
        ...process.env,
        PUBLISH_RATE_HZ: String(this.publishRateHz),
        JOINT_STATES_TOPIC: '/joint_states',
        ROBOT_ID: this.robotId,
        ENABLE_ZENOH: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const recordMockLog = (d: Buffer) => {
      const msg = d.toString();
      if (process.env.DEBUG_E2E) process.stderr.write(`[MOCK] ${msg}`);
    };
    this.mockPublisherProcess.stdout?.on('data', recordMockLog);
    this.mockPublisherProcess.stderr?.on('data', recordMockLog);

    await new Promise((r) => setTimeout(r, 600));
  }

  public async stopMockPublisher(): Promise<void> {
    if (
      !this.mockPublisherProcess ||
      this.mockPublisherProcess.killed ||
      this.mockPublisherProcess.exitCode !== null
    ) {
      this.mockPublisherProcess = null;
      return;
    }
    await this.killChild(this.mockPublisherProcess);
    this.mockPublisherProcess = null;
  }

  private async killChild(proc: ChildProcess | null): Promise<void> {
    if (!proc || proc.killed || proc.exitCode !== null) return;
    await new Promise<void>((resolve) => {
      if (proc.exitCode !== null) return resolve();
      let timeout: ReturnType<typeof setTimeout> | null = null;
      const onExit = () => {
        if (timeout) clearTimeout(timeout);
        resolve();
      };
      proc.once('exit', onExit);
      try {
        proc.kill('SIGTERM');
      } catch {
        onExit();
        return;
      }
      timeout = setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch {}
        resolve();
      }, 1500);
    });
  }

  public async stop(): Promise<void> {
    await Promise.all([
      this.stopMockPublisher(),
      this.killChild(this.edgeNodeProcess),
      this.killChild(this.gatewayProcess),
      this.killChild(this.webProcess),
    ]);

    this.cleanStalePorts();
  }
}
