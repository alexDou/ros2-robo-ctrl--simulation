import { setWorldConstructor, IWorldOptions, World } from '@cucumber/cucumber';
import { Browser, BrowserContext, Page } from '@playwright/test';
import { ServiceHarness } from './harness';
import { TeleopPage } from '../pages/TeleopPage';

export interface ICustomWorld extends World {
  browser?: Browser;
  context?: BrowserContext;
  page?: Page;
  teleopPage?: TeleopPage;
  secondContext?: BrowserContext;
  secondPage?: Page;
  secondTeleopPage?: TeleopPage;
  harness: ServiceHarness;
  baseUrl: string;
}

export class CustomWorld extends World implements ICustomWorld {
  browser?: Browser;
  context?: BrowserContext;
  page?: Page;
  teleopPage?: TeleopPage;
  secondContext?: BrowserContext;
  secondPage?: Page;
  secondTeleopPage?: TeleopPage;
  harness: ServiceHarness;
  baseUrl: string;

  constructor(options: IWorldOptions) {
    super(options);
    this.harness = new ServiceHarness();
    this.baseUrl = this.harness.baseUrl;
  }
}

setWorldConstructor(CustomWorld);
