import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, ViteDevServer } from 'vite';
import { DEFAULT_ROBOT_ID } from '../../../domain/contracts';
import { MockGateway } from './mock_gateway';

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
  public readonly isLive: boolean;

  private mockGateway: MockGateway | null = null;
  private viteServer: ViteDevServer | null = null;

  constructor(config: HarnessConfig = {}) {
    this.isLive = process.env.E2E_LIVE === '1' || process.env.E2E_LIVE === 'true';
    const defaultGatewayPort = this.isLive ? 8080 : 8085;
    this.gatewayPort = config.gatewayPort ?? Number(process.env.E2E_GATEWAY_PORT || defaultGatewayPort);
    this.webPort = config.webPort ?? Number(process.env.E2E_WEB_PORT || 3005);
    this.robotId = config.robotId ?? DEFAULT_ROBOT_ID;
    this.publisherScript =
      config.publisherScript ??
      process.env.E2E_PUBLISHER_SCRIPT ??
      'mock';
    this.publishRateHz = config.publishRateHz ?? 30.0;
    this.baseUrl = `http://127.0.0.1:${this.webPort}/?robot_id=${this.robotId}&gateway_port=${this.gatewayPort}`;
  }

  public async start(): Promise<void> {
    // Live mode: TeleopClient under test talks to real Gateway
    // (booted via scripts/launch_ros2.sh + scripts/launch_gateway.sh).
    // Only the in-process Vite server is owned here; external
    // ROS2/Gateway processes are never spawned, so stop() cannot orphan them.
    if (!this.isLive) {
      this.mockGateway = new MockGateway({
        port: this.gatewayPort,
        host: '127.0.0.1',
      });
      await this.mockGateway.start();
    }

    // 2. Start in-process Vite dev server
    this.viteServer = await createServer({
      root: WEB_DIR,
      configFile: path.resolve(WEB_DIR, 'vite.config.ts'),
      server: {
        port: this.webPort,
        strictPort: true,
      },
    });
    await this.viteServer.listen();

    // 3. Live mode: fail fast unless real Gateway answers /health.
    // Never spawn ROS2/Gateway here; operator boots them via
    // scripts/launch_ros2.sh + scripts/launch_gateway.sh.
    if (this.isLive) {
      await this.waitForGatewayHealth();
    }
  }

  private async waitForGatewayHealth(timeoutMs = 15000): Promise<void> {
    const url = `http://127.0.0.1:${this.gatewayPort}/health`;
    const deadline = Date.now() + timeoutMs;
    let lastError = '';
    while (Date.now() < deadline) {
      try {
        const res = await fetch(url);
        if (res.ok) return;
        lastError = `HTTP ${res.status}`;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(
      `Live Gateway health check failed at ${url}: ${lastError}. ` +
        `Boot scripts/launch_ros2.sh and scripts/launch_gateway.sh first.`
    );
  }

  public getCapturedLogs(): string {
    return this.mockGateway ? this.mockGateway.getCapturedLogs() : '';
  }

  public clearCapturedLogs(): void {
    this.mockGateway?.clearCapturedLogs();
  }

  public reset(): void {
    this.mockGateway?.reset();
  }

  public isMockPublisherRunning(): boolean {
    return this.mockGateway ? this.mockGateway.isDynamicMotionEnabled() : false;
  }

  public async startMockPublisher(): Promise<void> {
    this.mockGateway?.setDynamicMotionEnabled(true);
  }

  public async stopMockPublisher(): Promise<void> {
    this.mockGateway?.setDynamicMotionEnabled(false);
  }

  public setAutoExecutePickAndPlace(enabled: boolean): void {
    this.mockGateway?.setAutoExecutePickAndPlace(enabled);
  }

  public async stop(): Promise<void> {
    if (this.mockGateway) {
      await this.mockGateway.close();
      this.mockGateway = null;
    }
    if (this.viteServer) {
      await this.viteServer.close();
      this.viteServer = null;
    }
  }
}
