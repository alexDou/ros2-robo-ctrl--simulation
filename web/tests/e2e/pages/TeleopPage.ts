import { Page, Locator, expect } from '@playwright/test';
import { CANONICAL_UR5E_JOINTS } from '@contracts';

export class TeleopPage {
  readonly page: Page;
  readonly connectionBadge: Locator;
  readonly pingButton: Locator;
  readonly verifyConnectionButton: Locator;
  readonly eventLog: Locator;
  readonly conflictBanner: Locator;
  readonly errorLogItem: Locator;
  readonly telemetryMonitor: Locator;
  readonly frequencyReadout: Locator;
  readonly latencyReadout: Locator;
  readonly visualizerContainer: Locator;
  readonly visualizerCanvas: Locator;

  constructor(page: Page) {
    this.page = page;
    this.connectionBadge = page.getByTestId('connection-badge');
    this.pingButton = page.getByRole('button', { name: /(ping|verify connection)/i });
    this.verifyConnectionButton = page.getByTestId('verify-connection-button');
    this.eventLog = page.getByTestId('event-log');
    this.conflictBanner = page.getByTestId('conflict-banner');
    this.errorLogItem = page.getByTestId('log-item-error');
    this.telemetryMonitor = page.getByTestId('telemetry-monitor');
    this.frequencyReadout = page.getByTestId('telemetry-frequency');
    this.latencyReadout = page.getByTestId('telemetry-latency');
    this.visualizerContainer = page.getByTestId('robot-visualizer');
    this.visualizerCanvas = page.getByTestId('robot-canvas');
  }

  async goto(url: string): Promise<void> {
    await this.page.goto(url);
  }

  async expectConnectionStatus(status: string | RegExp, timeout = 10000): Promise<void> {
    await expect(this.connectionBadge).toHaveText(status, { timeout });
  }

  async clickPing(): Promise<void> {
    await expect(this.pingButton).toBeEnabled();
    await this.pingButton.click();
  }

  async expectEventLogContains(text: string | RegExp, timeout = 5000): Promise<void> {
    await expect(this.eventLog).toContainText(text, { timeout });
  }

  async expectConflictBanner(text: string | RegExp, timeout = 5000): Promise<void> {
    await expect(this.conflictBanner).toBeVisible({ timeout });
    await expect(this.conflictBanner).toContainText(text);
  }

  async injectRawFrame(payload: string): Promise<void> {
    await this.page.evaluate((raw) => {
      const ws = (window as unknown as { __teleop_ws?: WebSocket }).__teleop_ws;
      if (!ws) throw new Error('Active WebSocket instance not found on window.__teleop_ws');
      ws.send(raw);
    }, payload);
  }

  async expectErrorDiagnostic(code: string, message: string, timeout = 5000): Promise<void> {
    await expect(this.errorLogItem).toBeVisible({ timeout });
    await expect(this.errorLogItem).toContainText(`[ERROR: ${code}]`);
    await expect(this.errorLogItem).toContainText(message);
  }

  async expectTelemetryFrequencyRange(minHz: number, maxHz: number, timeout = 10000): Promise<void> {
    await expect
      .poll(
        async () => {
          const text = await this.frequencyReadout.innerText();
          const match = text.match(/(\d+)\s*Hz/);
          return match ? parseInt(match[1], 10) : 0;
        },
        { timeout, message: `Expected telemetry frequency between ${minHz} and ${maxHz} Hz` }
      )
      .toBeGreaterThanOrEqual(minHz);

    await expect
      .poll(
        async () => {
          const text = await this.frequencyReadout.innerText();
          const match = text.match(/(\d+)\s*Hz/);
          return match ? parseInt(match[1], 10) : 0;
        },
        { timeout, message: `Expected telemetry frequency between ${minHz} and ${maxHz} Hz` }
      )
      .toBeLessThanOrEqual(maxHz);
  }

  async expectTelemetryLatencyBelow(maxMs: number, timeout = 10000): Promise<void> {
    await expect
      .poll(
        async () => {
          const text = await this.latencyReadout.innerText();
          const match = text.match(/(\d+)\s*ms/);
          return match ? parseInt(match[1], 10) : 999;
        },
        { timeout, message: `Expected telemetry latency below ${maxMs} ms` }
      )
      .toBeLessThanOrEqual(maxMs);
  }

  async expectCanonicalJointsDisplayed(timeout = 5000): Promise<void> {
    for (const jointName of CANONICAL_UR5E_JOINTS) {
      const jointVal = this.page.getByTestId(`joint-val-${jointName}`);
      await expect(jointVal).toBeVisible({ timeout });
      await expect(jointVal).toHaveText(/^-?\d+\.\d{3}\s+rad\s+\(-?\d+\.\d+°\)$/, { timeout });
    }
  }

  async expectVerifyConnectionControlsRemoved(timeout = 5000): Promise<void> {
    await expect(this.verifyConnectionButton).toBeHidden({ timeout });
  }

  async waitForRobotLoaded(timeout = 15000): Promise<void> {
    await expect(this.visualizerCanvas).toBeVisible({ timeout });
    await expect
      .poll(
        async () => {
          return await this.page.evaluate(() => {
            const handle = (window as unknown as {
              __robot_visualizer?: { isLoaded: () => boolean };
            }).__robot_visualizer;
            return handle ? handle.isLoaded() : false;
          });
        },
        {
          timeout,
          message: 'URDF robot model failed to load into Three.js scene within timeout',
        }
      )
      .toBe(true);
  }

  async getRobotJointValues(): Promise<Record<string, number>> {
    return await this.page.evaluate(() => {
      const handle = (window as unknown as {
        __robot_visualizer?: { getJointValues: () => Record<string, number> };
      }).__robot_visualizer;
      return handle ? handle.getJointValues() : {};
    });
  }

  async getLinkWorldPosition(
    linkName: string
  ): Promise<{ x: number; y: number; z: number } | null> {
    return await this.page.evaluate((name) => {
      const handle = (window as unknown as {
        __robot_visualizer?: {
          getLinkWorldPosition: (n: string) => { x: number; y: number; z: number } | null;
        };
      }).__robot_visualizer;
      return handle ? handle.getLinkWorldPosition(name) : null;
    }, linkName);
  }

  async getSidebarJointValues(): Promise<Record<string, number>> {
    const result: Record<string, number> = {};
    for (const jointName of CANONICAL_UR5E_JOINTS) {
      const text = await this.page.getByTestId(`joint-val-${jointName}`).innerText();
      const match = text.match(/^(-?\d+\.\d+)\s*rad/);
      if (match) {
        result[jointName] = parseFloat(match[1]);
      }
    }
    return result;
  }

  async expectJointsOscillating(durationMs = 2000, minDeltaRad = 0.03): Promise<void> {
    const sample1 = await this.getRobotJointValues();
    await this.page.waitForTimeout(durationMs);
    const sample2 = await this.getRobotJointValues();

    for (const jointName of CANONICAL_UR5E_JOINTS) {
      const val1 = sample1[jointName];
      const val2 = sample2[jointName];
      expect(val1).toBeDefined();
      expect(val2).toBeDefined();

      // Bounded within physical limits [-pi, pi]
      expect(val1).toBeGreaterThanOrEqual(-Math.PI);
      expect(val1).toBeLessThanOrEqual(Math.PI);
      expect(val2).toBeGreaterThanOrEqual(-Math.PI);
      expect(val2).toBeLessThanOrEqual(Math.PI);

      const delta = Math.abs(val2 - val1);
      expect(delta).toBeGreaterThanOrEqual(minDeltaRad);
    }
  }

  async expectLinkCoordinatesMoving(
    linkName = 'wrist_3_link',
    durationMs = 1500,
    minDelta = 0.005
  ): Promise<void> {
    const p1 = await this.getLinkWorldPosition(linkName);
    expect(p1).not.toBeNull();
    await this.page.waitForTimeout(durationMs);
    const p2 = await this.getLinkWorldPosition(linkName);
    expect(p2).not.toBeNull();

    const distance = Math.hypot(p2!.x - p1!.x, p2!.y - p1!.y, p2!.z - p1!.z);
    expect(distance).toBeGreaterThanOrEqual(minDelta);
  }

  async expectSidebarInSyncWithVisualizer(toleranceRad = 0.05, timeout = 5000): Promise<void> {
    await expect
      .poll(
        async () => {
          return await this.page.evaluate((joints) => {
            const handle = (window as unknown as {
              __robot_visualizer?: { getJointValues: () => Record<string, number> };
            }).__robot_visualizer;
            const vizVals = handle ? handle.getJointValues() : null;
            if (!vizVals) return 999;

            let maxDiff = 0;
            for (const joint of joints) {
              const el = document.querySelector(`[data-testid="joint-val-${joint}"]`);
              if (!el || !el.textContent) return 999;
              const match = el.textContent.match(/^(-?\d+\.\d+)\s*rad/);
              if (!match) return 999;
              const domRad = parseFloat(match[1]);
              const vizRad = vizVals[joint];
              if (typeof vizRad !== 'number') return 999;
              const diff = Math.abs(domRad - vizRad);
              if (diff > maxDiff) maxDiff = diff;
            }
            return maxDiff;
          }, CANONICAL_UR5E_JOINTS);
        },
        {
          timeout,
          message: `Expected sidebar readouts to sync with 3D canvas within ${toleranceRad} rad`,
        }
      )
      .toBeLessThanOrEqual(toleranceRad);
  }

  async getRendererMemoryInfo(): Promise<{ geometries: number; textures: number; calls: number } | null> {
    return await this.page.evaluate(() => {
      const handle = (window as unknown as {
        __robot_visualizer?: {
          getRendererInfo: () => {
            memory: { geometries: number; textures: number };
            render: { calls: number };
          } | null;
        };
      }).__robot_visualizer;
      const info = handle?.getRendererInfo();
      return info
        ? {
            geometries: info.memory.geometries,
            textures: info.memory.textures,
            calls: info.render.calls,
          }
        : null;
    });
  }

  async expectCleanVisualizerDisposal(): Promise<void> {
    const isDisposed = await this.page.evaluate(() => {
      const handle = (window as unknown as {
        __robot_visualizer?: { isDisposed: () => boolean };
      }).__robot_visualizer;
      return handle ? handle.isDisposed() : true;
    });
    expect(isDisposed).toBe(true);
  }
}
