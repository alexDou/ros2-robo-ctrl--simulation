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
}
