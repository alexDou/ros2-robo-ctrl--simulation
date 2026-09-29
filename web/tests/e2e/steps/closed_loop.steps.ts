import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { CANONICAL_POSES, PoseName, GREEN_TOWER, STACK_STEP_M } from '@contracts';
import { CustomWorld } from '../support/world';
import {
  SCRAP_BIN_EMPTY_COLOR,
  SCRAP_BIN_FILLED_COLOR,
} from '../../../src/components/RobotVisualizer/assets/scrapbin';

When(
  'the operator clicks the {string} pose button',
  async function (this: CustomWorld, poseName: string) {
    expect(this.teleopPage).toBeDefined();
    expect(poseName).toBe('Home');
    await this.teleopPage!.clickHomePose();
  },
);

Then(
  'the event log should record state transition to {string}',
  async function (this: CustomWorld, state: string) {
    expect(this.teleopPage).toBeDefined();
    await this.teleopPage!.expectEventLogContains(new RegExp(`State:\\s*${state}`));
  },
);

Then(
  'the 3D robot model should reach the {string} pose within {int} seconds',
  async function (this: CustomWorld, poseKey: string, maxSeconds: number) {
    expect(this.teleopPage).toBeDefined();
    const targetPose = CANONICAL_POSES[poseKey as PoseName];
    expect(targetPose).toBeDefined();
    await this.teleopPage!.expectRobotAtPose(targetPose, 0.08, maxSeconds * 1000);
  },
);

Then(
  'the palm status should indicate {string}',
  async function (this: CustomWorld, status: string) {
    expect(this.teleopPage).toBeDefined();
    expect(status).toMatch(/^(Grasped|Released)$/);
    // Palm badge removed in 6.6.4a; 3D nozzle highlight is the grasp source of truth.
    await this.teleopPage!.expectPalmNozzleHighlighted(status === 'Grasped');
  },
);

Then(
  'the palm status should indicate {string} within {int} ms',
  async function (this: CustomWorld, status: string, timeoutMs: number) {
    expect(this.teleopPage).toBeDefined();
    expect(status).toMatch(/^(Grasped|Released)$/);
    await this.teleopPage!.expectPalmNozzleHighlighted(status === 'Grasped', timeoutMs);
  },
);

Then('the palm nozzle visual material should be idle', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.expectPalmNozzleHighlighted(false);
});

Then('the palm nozzle visual material should be highlighted', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.expectPalmNozzleHighlighted(true);
});

When('the robot begins executing trajectory motion', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await expect(this.teleopPage!.connectionBadge).toHaveText(/CONNECTED \/ EXECUTING/, {
    timeout: 3000,
  });
});

When('the operator dispatches an EMERGENCY_STOP command', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.dispatchEstop('E2E safety scenario');
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
  },
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

Given('the robot is in {string} state', async function (this: CustomWorld, expectedState: string) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.expectConnectionStatus(/CONNECTED/);
  const badgeText = await this.teleopPage!.connectionBadge.innerText();
  if (!badgeText.includes(expectedState)) {
    if (expectedState === 'FAULT') {
      await this.teleopPage!.dispatchEstop('E2E legacy scenario');
      await this.teleopPage!.expectConnectionStatus(/FAULT/);
    }
  }
});

When('the operator clicks the "Reset Fault" button', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  this._preResetJoints = await this.teleopPage!.getRobotJointValues();
  await this.teleopPage!.clickResetFault();
});

Then('the robot joint positions should remain unchanged', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  const pre = this._preResetJoints;
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

When('the operator clicks the "Fill" button', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.clickFill();
});

Then('the hopper should be full', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.expectHopperFull();
});

Then('Process should be enabled and Fill disabled', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.expectFillDisabledProcessEnabled();
});

When('the operator clicks the "Process" button', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.clickProcess();
});

Then('the belt surface should be moving', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.expectBeltMoving();
});

Then(
  'the belt should halt with a Batch of 3 to 10 gears inside the PickZone',
  async function (this: CustomWorld) {
    expect(this.teleopPage).toBeDefined();
    await this.teleopPage!.expectBatchHaltedInPickZone();
  },
);

Then('the belt surface should be frozen', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.expectBeltFrozen();
});

Then('the hopper should hold the rest of the deck', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.expectHopperHoldsRestOfDeck();
});

Then('Fill and Process should both be disabled', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await expect(this.teleopPage!.fillButton).toBeDisabled();
  await expect(this.teleopPage!.processButton).toBeDisabled();
});

When('a defective gear is spawned', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.dispatchDefectiveSpawn();
});

Then('the scrap bin should be green', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.expectScrapBinFloorHex(SCRAP_BIN_EMPTY_COLOR);
});

Then('the scrap bin should turn red', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.expectScrapBinFloorHex(SCRAP_BIN_FILLED_COLOR);
});

Then('the arm should not have moved', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.expectEventLogNotContains('State: EXECUTING');
});

Given('the GREEN tower already holds {int} gears', async function (this: CustomWorld, n: number) {
  expect(this.teleopPage).toBeDefined();
  this.harness.seedProcessed(
    Array.from({ length: n }, (_, k) => ({
      id: `seed-green-${k}`,
      x: GREEN_TOWER[0],
      y: GREEN_TOWER[1],
      z: k * STACK_STEP_M,
      color: 'GREEN' as const,
      intact: true,
      origin_x: 0.4,
      origin_y: 0,
      origin_z: 0,
    })),
  );
  await this.teleopPage!.expectTowerCounter('GREEN', `GREEN: ${n}/10`);
});

When('a 10th intact GREEN gear is picked', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.dispatchIntactGreenPick();
});

Then(
  'the GREEN tower counter should read {string}',
  async function (this: CustomWorld, text: string) {
    expect(this.teleopPage).toBeDefined();
    await this.teleopPage!.expectTowerCounter('GREEN', `GREEN: ${text}`);
  },
);

Then('the GREEN tower stack should have faded out', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.expectTowerGearCount(0);
});

Then('the halted Batch is sorted gear by gear', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  const batch = await this.teleopPage!.getBatchComposition();
  await this.teleopPage!.expectBatchSorted(batch);
});

When('the Batch composition is being recorded', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.startRecordingBatch();
});
