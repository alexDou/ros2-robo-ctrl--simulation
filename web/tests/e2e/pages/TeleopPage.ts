import { Page, Locator, expect } from '@playwright/test';

export class TeleopPage {
  readonly page: Page;
  readonly connectionBadge: Locator;
  readonly pingButton: Locator;
  readonly eventLog: Locator;
  readonly conflictBanner: Locator;
  readonly errorLogItem: Locator;

  constructor(page: Page) {
    this.page = page;
    this.connectionBadge = page.getByTestId('connection-badge');
    this.pingButton = page.getByRole('button', { name: /ping/i });
    this.eventLog = page.getByTestId('event-log');
    this.conflictBanner = page.getByTestId('conflict-banner');
    this.errorLogItem = page.getByTestId('log-item-error');
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
}
