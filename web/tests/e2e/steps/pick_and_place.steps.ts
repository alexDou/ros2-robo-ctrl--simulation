import { Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { CustomWorld } from '../support/world';

Then('the SpindleTower fixture should be mounted in the WebGL scene', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.expectSpindleTowerLoaded();
});

Then('the action progress bar should become visible', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.expectActionProgressVisible(true);
});

Then('the action progress bar should indicate phase {string}', async function (this: CustomWorld, phase: string) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.expectActionPhase(new RegExp(phase, 'i'));
});

Then('the action progress bar should reach at least {int}%', async function (this: CustomWorld, minPercent: number) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.expectActionPercentAtLeast(minPercent);
});

Then('the action progress bar should indicate completed', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.expectActionCompleted();
});

Then('the gear should attach to the robot tool flange', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.expectGearAttached(true);
});

Then(
  'the gear should be deposited on the SpindleTower at height {float} m',
  async function (this: CustomWorld, height: number) {
    expect(this.teleopPage).toBeDefined();
    await this.teleopPage!.expectTowerTopGearHeight(height, 0.005);
  }
);

Then(
  /^the SpindleTower should contain (\d+) gears?$/,
  async function (this: CustomWorld, countStr: string) {
    expect(this.teleopPage).toBeDefined();
    const count = parseInt(countStr, 10);
    await this.teleopPage!.expectTowerGearCount(count);
  }
);
