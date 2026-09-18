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

  private mockGateway: MockGateway | null = null;
  private viteServer: ViteDevServer | null = null;

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

  public async start(): Promise<void> {
    // 1. Start in-process MockGateway
    this.mockGateway = new MockGateway({
      port: this.gatewayPort,
      host: '127.0.0.1',
    });
    await this.mockGateway.start();

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
