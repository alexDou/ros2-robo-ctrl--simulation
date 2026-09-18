import { Before, After, BeforeAll, AfterAll, setDefaultTimeout, Status } from '@cucumber/cucumber';
import { chromium, Browser } from '@playwright/test';
import { CustomWorld } from './world';
import { ServiceHarness } from './harness';
import { TeleopPage } from '../pages/TeleopPage';

setDefaultTimeout(60000);

let sharedBrowser: Browser;
let sharedHarness: ServiceHarness;

BeforeAll(async function () {
  sharedHarness = new ServiceHarness();
  await sharedHarness.start();

  sharedBrowser = await chromium.launch({
    headless: process.env.HEADLESS !== 'false',
    args: ['--use-gl=angle', '--no-sandbox', '--disable-setuid-sandbox'],
  });
});

AfterAll(async function () {
  try {
    if (sharedBrowser) {
      await sharedBrowser.close();
    }
  } finally {
    if (sharedHarness) {
      await sharedHarness.stop();
    }
  }
});

Before(async function (this: CustomWorld, scenario) {
  this.harness = sharedHarness;
  this.baseUrl = sharedHarness.baseUrl;
  this.browser = sharedBrowser;
  this.harness.reset();

  const isClosedLoop = scenario.pickle.tags.some(
    (t) => t.name === '@closed-loop' || t.name === '@workcell'
  );
  if (isClosedLoop) {
    if (this.harness.isMockPublisherRunning()) {
      await this.harness.stopMockPublisher();
    }
  } else {
    if (!this.harness.isMockPublisherRunning()) {
      await this.harness.startMockPublisher();
    }
  }

  this.context = await sharedBrowser.newContext();
  this.page = await this.context.newPage();
  this.teleopPage = new TeleopPage(this.page);
});

After(async function (this: CustomWorld, scenario) {
  if (scenario.result?.status === Status.FAILED && this.page) {
    try {
      const screenshot = await this.page.screenshot({ fullPage: true });
      this.attach(screenshot, 'image/png');
    } catch {
      // Ignore screenshot errors on failed teardown
    }
  }

  // Restore IDLE state if robot was left in FAULT and clear active gear
  if (this.teleopPage && this.page && !this.page.isClosed()) {
    try {
      const badge = await this.teleopPage.connectionBadge.innerText({ timeout: 500 }).catch(() => '');
      if (badge.includes('FAULT')) {
        await this.teleopPage.clickResetFault().catch(() => {});
        await this.teleopPage.expectConnectionStatus(/IDLE/, 1000).catch(() => {});
      }
      if (await this.teleopPage.hasActiveGear()) {
        await this.teleopPage.clickClearWorkspace().catch(() => {});
      }
    } catch {
      // Ignore cleanup error on teardown
    }
  }

  if (this.secondPage) {
    await this.secondPage.close().catch(() => {});
  }
  if (this.secondContext) {
    await this.secondContext.close().catch(() => {});
  }
  if (this.page) {
    await this.page.close().catch(() => {});
  }
  if (this.context) {
    await this.context.close().catch(() => {});
  }
});
