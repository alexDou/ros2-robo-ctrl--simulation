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
  });
});

AfterAll(async function () {
  if (sharedBrowser) {
    await sharedBrowser.close();
  }
  if (sharedHarness) {
    await sharedHarness.stop();
  }
});

Before(async function (this: CustomWorld) {
  this.harness = sharedHarness;
  this.baseUrl = sharedHarness.baseUrl;
  this.browser = sharedBrowser;

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
