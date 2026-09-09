import { test as baseTest, expect } from '@playwright/test';
import { ServiceHarness } from './harness';

const test = baseTest.extend<{ harness: ServiceHarness }, { services: ServiceHarness }>({
  services: [
    async ({ playwright: _playwright }, use) => {
      const harness = new ServiceHarness();
      await harness.start();
      await use(harness);
      await harness.stop();
    },
    { scope: 'worker', auto: true },
  ],
  harness: async ({ services }, use) => {
    await use(services);
  },
});

test.describe('Distributed Teleoperation Multi-Service E2E Suite', () => {
  test('E2E Test 1: Operator opens TeleopClient, clicks Ping, verifies DOM telemetry update and ROS2 log', async ({
    page,
    harness,
  }) => {
    await page.goto(harness.baseUrl);

    const badge = page.getByTestId('connection-badge');
    await expect(badge).toHaveText(/CONNECTED/, { timeout: 10000 });

    const pingBtn = page.getByRole('button', { name: /ping/i });
    await expect(pingBtn).toBeEnabled();
    await pingBtn.click();

    const eventLog = page.getByTestId('event-log');
    await expect(eventLog).toContainText('[TELEMETRY]', { timeout: 5000 });
    await expect(eventLog).toContainText('State: IDLE', { timeout: 5000 });

    await expect
      .poll(() => harness.getCapturedLogs(), {
        message: 'ROS2 logger should output received PING command',
        timeout: 5000,
      })
      .toContain('Received PING command');
  });

  test('E2E Test 2: Second browser instance connects to /ws/teleop/robot/0 and is rejected with 409 Conflict', async ({
    page,
    harness,
  }) => {
    await page.goto(harness.baseUrl);
    const badge = page.getByTestId('connection-badge');
    await expect(badge).toHaveText(/CONNECTED/, { timeout: 10000 });

    const secondContext = await page.context().browser()?.newContext();
    expect(secondContext).toBeDefined();

    const secondPage = await secondContext!.newPage();
    try {
      await secondPage.goto(harness.baseUrl);

      const secondBadge = secondPage.getByTestId('connection-badge');
      await expect(secondBadge).toHaveText(/CONFLICT/, { timeout: 10000 });

      const conflictBanner = secondPage.getByTestId('conflict-banner');
      await expect(conflictBanner).toBeVisible({ timeout: 5000 });
      await expect(conflictBanner).toContainText('Active session already exists');
    } finally {
      await secondContext!.close();
    }
  });

  test('E2E Test 3: Raw malformed frame returns structured ERROR diagnostics without terminating session', async ({
    page,
    harness,
  }) => {
    await page.goto(harness.baseUrl);
    const badge = page.getByTestId('connection-badge');
    await expect(badge).toHaveText(/CONNECTED/, { timeout: 10000 });

    await page.evaluate(() => {
      const ws = (window as unknown as { __teleop_ws?: WebSocket }).__teleop_ws;
      if (!ws) throw new Error('Active WebSocket instance not found on window.__teleop_ws');
      ws.send('INVALID_RAW_NON_JSON_PAYLOAD');
    });

    const errorItem = page.getByTestId('log-item-error');
    await expect(errorItem).toBeVisible({ timeout: 5000 });
    await expect(errorItem).toContainText('[ERROR: SCHEMA_VALIDATION_ERROR]');
    await expect(errorItem).toContainText('Malformed RobotCommand payload');

    await expect(badge).toHaveText(/CONNECTED/);

    const pingBtn = page.getByRole('button', { name: /ping/i });
    await pingBtn.click();

    const eventLog = page.getByTestId('event-log');
    await expect(eventLog).toContainText('[TELEMETRY]', { timeout: 5000 });
  });
});
