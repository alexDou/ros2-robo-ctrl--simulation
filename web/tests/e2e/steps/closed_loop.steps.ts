import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { CANONICAL_POSES, PoseName } from '@contracts';
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

Given('a device fault froze the cell', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.expectConnectionStatus(/CONNECTED/);
  // EmergencyStop ends the session (D31); a device fault is what Reset Fault recovers (D20).
  this.harness.injectDeviceFault('conveyor', 'FAULT');
  await expect(this.page!.getByTestId('reset-fault-button')).toBeEnabled();
});

When('the operator clicks the "Reset Fault" button', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.clickResetFault();
});

When('the operator clicks the "Fill" button', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.clickFill();
});

Then('the hopper should be full', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.expectHopperFull();
});

When('the operator clicks the "Stop" button', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.clickStop();
});

Then(
  'the run should be stopped with Fill disabled and Process enabled',
  async function (this: CustomWorld) {
    expect(this.teleopPage).toBeDefined();
    await this.teleopPage!.expectStopped();
  },
);

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

Then('the scrap bin should turn red', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.expectScrapBinFloorHex(SCRAP_BIN_FILLED_COLOR);
});

When('the Batch composition is being recorded', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.startRecordingBatch();
});

Given('the mock arm runs {int} times faster', function (this: CustomWorld, factor: number) {
  this.harness.setMotionSpeed(factor);
});

Given('the deck seed is {int}', function (this: CustomWorld, seed: number) {
  this.harness.setDeckSeed(seed);
});

Then(
  'the browser should have sent only cell intents to run the deck',
  { timeout: 180000 },
  async function (this: CustomWorld) {
    await expect
      .poll(() => this.harness.getReceivedCommands().some((c) => c.type === 'CELL_PROCESS'))
      .toBe(true);
    const sequencing = this.harness
      .getReceivedCommands()
      .filter((c) => c.type === 'SPAWN_OBJECT' || c.type === 'PICK_AND_PLACE_TARGET');
    expect(sequencing).toEqual([]);
  },
);

Then('the whole deck should be processed', { timeout: 180000 }, async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.expectRunFinished();
});

Then('every tower counter should read {string}', async function (this: CustomWorld, text: string) {
  expect(this.teleopPage).toBeDefined();
  for (const color of ['WHITE', 'GREEN', 'BLUE']) {
    await this.teleopPage!.expectTowerCounter(color, `${color}: ${text}`);
  }
});

Then('some gears should have been sorted', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.expectSomeGearsSorted();
});

Then('the session should end with an EmergencyStop notice', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.expectConnectionStatus(/DISCONNECTED/);
  await expect(this.page!.getByText(/Session ended by EmergencyStop/)).toBeVisible();
});

When('the operator connects again', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.clickConnect();
});

When('the operator reloads the page and reconnects', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.reload();
  await this.teleopPage!.clickConnect();
});

Then('the hopper, belt, towers and bin should all be empty', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.expectEverythingEmpty();
  await this.teleopPage!.expectScrapBinFloorHex(SCRAP_BIN_EMPTY_COLOR);
});
