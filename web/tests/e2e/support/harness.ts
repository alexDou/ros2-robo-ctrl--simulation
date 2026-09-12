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
}

export class ServiceHarness {
  public readonly gatewayPort: number;
  public readonly webPort: number;
  public readonly robotId: string;
  public readonly baseUrl: string;

  private gatewayProcess: ChildProcess | null = null;
  private edgeNodeProcess: ChildProcess | null = null;
  private mockPublisherProcess: ChildProcess | null = null;
  private webProcess: ChildProcess | null = null;

  public readonly edgeNodeLogs: string[] = [];

  constructor(config: HarnessConfig = {}) {
    this.gatewayPort = config.gatewayPort ?? 8080;
    this.webPort = config.webPort ?? 3000;
    this.robotId = config.robotId ?? DEFAULT_ROBOT_ID;
    this.baseUrl = `http://127.0.0.1:${this.webPort}/?robot_id=${this.robotId}`;
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

    // 3b. Start Mock JointState Publisher at 30 Hz
    this.mockPublisherProcess = spawn('uv', ['run', 'python', 'src/edge_node/mock_publisher.py'], {
      cwd: ROOT_DIR,
      env: {
        ...process.env,
        PUBLISH_RATE_HZ: '30.0',
        JOINT_STATES_TOPIC: '/joint_states',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.mockPublisherProcess.stderr?.on('data', (d: Buffer) => {
      if (process.env.DEBUG_E2E) process.stderr.write(`[MOCK] ${d.toString()}`);
    });

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

  public async stop(): Promise<void> {
    const killProc = async (proc: ChildProcess | null) => {
      if (!proc || proc.killed || proc.exitCode !== null) return;
      try {
        proc.kill('SIGTERM');
        const timeout = setTimeout(() => {
          try {
            proc.kill('SIGKILL');
          } catch {}
        }, 1500);
        await new Promise((resolve) => proc.on('exit', resolve));
        clearTimeout(timeout);
      } catch {}
    };

    await Promise.all([
      killProc(this.mockPublisherProcess),
      killProc(this.edgeNodeProcess),
      killProc(this.gatewayProcess),
      killProc(this.webProcess),
    ]);

    this.cleanStalePorts();
  }
}
