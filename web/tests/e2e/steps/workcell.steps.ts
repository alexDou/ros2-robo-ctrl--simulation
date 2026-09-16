import { When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { CustomWorld } from '../support/world';

Then('the 3D workcell table should be mounted in the WebGL scene', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.expectWorkcellTableLoaded();
});

Then('no active gear should be present in the workspace', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.expectActiveGear(false);
});

Then('an active gear should be present in the workspace', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.expectActiveGear(true);
});

Then('the Clear Workspace button should be disabled', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.expectClearWorkspaceButtonDisabled();
});

Then('the Clear Workspace button should be enabled', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.expectClearWorkspaceButtonEnabled();
});

When(
  'the operator clicks the workcell table at coordinates x {float} and y {float}',
  async function (this: CustomWorld, x: number, y: number) {
    expect(this.teleopPage).toBeDefined();
    await this.teleopPage!.clickWorkcellTable(x, y);
  }
);

When(
  'the operator clicks the workcell table at unreachable coordinates x {float} and y {float}',
  async function (this: CustomWorld, x: number, y: number) {
    expect(this.teleopPage).toBeDefined();
    await this.teleopPage!.clickWorkcellTable(x, y);
  }
);

When('the operator clicks the "Clear Workspace" button', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.clickClearWorkspace();
});

Then(
  'the 3D gearwheel mesh should be positioned at x {float} and y {float}',
  async function (this: CustomWorld, x: number, y: number) {
    expect(this.teleopPage).toBeDefined();
    await this.teleopPage!.expectGearwheelAtPosition(x, y, 0.05);
  }
);

Then('clicking the workcell table is locked out', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.expectClickLockedOut(true);
});

Then('clicking the workcell table is unlocked', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.expectClickLockedOut(false);
});

Then(
  'the EdgeNode ROS2 logger should record gear spawn at x {float} and y {float}',
  async function (this: CustomWorld, x: number, y: number) {
    await expect
      .poll(
        () => {
          const logs = this.harness.getCapturedLogs();
          const regex = /Spawned GEAR at \(([0-9.-]+),\s*([0-9.-]+),\s*0\.000\)/g;
          const matches = [...logs.matchAll(regex)];
          let closestDiff = 999;
          for (const match of matches) {
            const loggedX = parseFloat(match[1]);
            const loggedY = parseFloat(match[2]);
            const diff = Math.hypot(loggedX - x, loggedY - y);
            if (diff < closestDiff) {
              closestDiff = diff;
            }
          }
          return closestDiff;
        },
        {
          message: `EdgeNode logger should record gear spawn near (${x.toFixed(3)}, ${y.toFixed(3)}, 0.000)`,
          timeout: 5000,
        }
      )
      .toBeLessThanOrEqual(0.05);
  }
);

Then('the EdgeNode ROS2 logger should record workspace cleared', async function (this: CustomWorld) {
  await expect
    .poll(() => this.harness.getCapturedLogs(), {
      message: 'EdgeNode logger should record workspace cleared',
      timeout: 5000,
    })
    .toContain('Workspace cleared for command');
});

When(
  'the operator hovers over the workcell table at coordinates x {float} and y {float}',
  async function (this: CustomWorld, x: number, y: number) {
    expect(this.teleopPage).toBeDefined();
    await this.teleopPage!.hoverWorkcellTable(x, y);
  }
);

Then('the dynamic ring reticle should be visible', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.expectReticleVisible(true);
});

Then('the dynamic ring reticle should not be visible', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.expectReticleVisible(false);
});
