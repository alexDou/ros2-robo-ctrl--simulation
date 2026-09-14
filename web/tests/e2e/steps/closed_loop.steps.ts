import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { CANONICAL_POSES, PoseName } from '@contracts';
import { CustomWorld } from '../support/world';

When(
  'the operator clicks the {string} pose button',
  async function (this: CustomWorld, poseName: string) {
    expect(this.teleopPage).toBeDefined();
    await this.teleopPage!.clickCannedPose(poseName as 'Home' | 'Ready' | 'Inspect');
  }
);

Then(
  'the event log should record state transition to {string}',
  async function (this: CustomWorld, state: string) {
    expect(this.teleopPage).toBeDefined();
    await this.teleopPage!.expectEventLogContains(new RegExp(`State:\\s*${state}`));
  }
);

Then(
  'the 3D robot model should reach the {string} pose within {int} seconds',
  async function (this: CustomWorld, poseKey: string, maxSeconds: number) {
    expect(this.teleopPage).toBeDefined();
    const targetPose = CANONICAL_POSES[poseKey as PoseName];
    expect(targetPose).toBeDefined();
    await this.teleopPage!.expectRobotAtPose(targetPose, 0.08, maxSeconds * 1000);
  }
);

Then('the palm status should indicate {string}', async function (this: CustomWorld, status: string) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.expectPalmStatus(status);
});

Then(
  'the palm status should indicate {string} within {int} ms',
  async function (this: CustomWorld, status: string, timeoutMs: number) {
    expect(this.teleopPage).toBeDefined();
    await this.teleopPage!.expectPalmStatus(status, timeoutMs);
  }
);

Then('the palm nozzle visual material should be idle', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.expectPalmNozzleHighlighted(false);
});

Then('the palm nozzle visual material should be highlighted', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.expectPalmNozzleHighlighted(true);
});

When('the operator clicks the palm toggle button', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.clickPalmToggle();
});

Then(
  'the palm toggle button text should be {string}',
  async function (this: CustomWorld, text: string) {
    expect(this.teleopPage).toBeDefined();
    await this.teleopPage!.expectPalmButtonText(text);
  }
);

When('the robot begins executing trajectory motion', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await expect(this.teleopPage!.connectionBadge).toHaveText(
    /CONNECTED \/ (PROCESSING|EXECUTING)/,
    { timeout: 3000 }
  );
});

When('the operator clicks the "EMERGENCY STOP" button', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.clickEmergencyStop();
});

Then(
  'the robot motion should halt immediately within {int} ms',
  async function (this: CustomWorld, maxHaltMs: number) {
    expect(this.teleopPage).toBeDefined();
    // Allow maxHaltMs for motion abort to settle
    await this.page!.waitForTimeout(maxHaltMs);
    const s1 = await this.teleopPage!.getRobotJointValues();
    expect(Object.keys(s1).length).toBe(6);
    await this.page!.waitForTimeout(200);
    const s2 = await this.teleopPage!.getRobotJointValues();
    expect(Object.keys(s2).length).toBe(6);
    for (const joint of Object.keys(s1)) {
      const diff = Math.abs(s2[joint] - s1[joint]);
      expect(diff).toBeLessThanOrEqual(0.001);
    }
  }
);

Then('all action buttons should be disabled', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.expectActionButtonsDisabled();
});

Then('all action buttons should be enabled', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.expectActionButtonsEnabled();
});

Then('the Reset Fault button should be enabled', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.expectResetFaultButtonEnabled();
});

Then('the Reset Fault button should be disabled', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.expectResetFaultButtonDisabled();
});

Then('the EMERGENCY STOP button should remain enabled', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.expectEmergencyStopButtonEnabled();
});

Given('the robot is in {string} state', async function (this: CustomWorld, expectedState: string) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.expectConnectionStatus(/CONNECTED/);
  const badgeText = await this.teleopPage!.connectionBadge.innerText();
  if (!badgeText.includes(expectedState)) {
    if (expectedState === 'FAULT') {
      await this.teleopPage!.clickEmergencyStop();
      await this.teleopPage!.expectConnectionStatus(/FAULT/);
    }
  }
});

When('the operator clicks the "Reset Fault" button', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  (this as unknown as { _preResetJoints: Record<string, number> })._preResetJoints =
    await this.teleopPage!.getRobotJointValues();
  await this.teleopPage!.clickResetFault();
});

Then('the robot joint positions should remain unchanged', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  const pre = (this as unknown as { _preResetJoints?: Record<string, number> })._preResetJoints;
  expect(pre).toBeDefined();
  expect(Object.keys(pre!).length).toBe(6);
  await this.page!.waitForTimeout(300);
  const post = await this.teleopPage!.getRobotJointValues();
  expect(Object.keys(post).length).toBe(6);
  for (const joint of Object.keys(pre!)) {
    const diff = Math.abs(post[joint] - pre![joint]);
    expect(diff).toBeLessThan(0.005);
  }
});
