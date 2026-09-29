import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { CANONICAL_POSES, PoseName, GREEN_TOWER, STACK_STEP_M } from '@contracts';
import { CustomWorld } from '../support/world';
import type { ReceivedCommand } from '../support/mock_gateway';
import { buildDeck, runDeck } from '../../../src/utils/conveyorController';
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

When('the Batch composition is being recorded', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.startRecordingBatch();
});

Given('the mock arm runs {int} times faster', function (this: CustomWorld, factor: number) {
  this.harness.setMotionSpeed(factor);
  this.timeScale = factor;
});

Given('the deck seed is {int}', function (this: CustomWorld, seed: number) {
  this.deckSeed = seed;
});

/** The command stream the client must send for `seed`: what the spec says, derived from the deck. */
async function expectedCommandStream(seed: number): Promise<string[]> {
  const stream: string[] = [];
  await runDeck(buildDeck(seed), {
    seed,
    ports: {
      spawn: (p) => stream.push(`SPAWN ${p.color} ${p.intact ? 'intact' : 'defective'}`),
      pickAndPlace: () => stream.push('PICK'),
      waitForRegistered: async () => undefined,
      waitForSettled: async () => undefined,
      goHome: async () => {
        stream.push('HOME');
      },
    },
    feedUntilHalted: async (f) => {
      for (let t = 0; f.status() === 'FEEDING' && t < 600; t += 0.02) f.step(0.02);
    },
    assertActive: () => undefined,
    onFeeder: () => undefined,
    onStatus: () => undefined,
  });
  return stream;
}

function describeReceived(cmds: readonly ReceivedCommand[]): string[] {
  const out: string[] = [];
  for (const c of cmds) {
    if (c.type === 'SPAWN_OBJECT') {
      out.push(`SPAWN ${c.payload.color} ${c.payload.intact ? 'intact' : 'defective'}`);
    } else if (c.type === 'PICK_AND_PLACE_TARGET') {
      out.push('PICK');
    } else if (c.type === 'TRAJECTORY_EXECUTE' && c.payload.pose_name === 'HOME') {
      out.push('HOME');
    }
  }
  return out;
}

Then(
  'the mock gateway should have received the seeded deck sorted Batch by Batch',
  { timeout: 180000 },
  async function (this: CustomWorld) {
    expect(this.deckSeed).toBeDefined();
    const expected = await expectedCommandStream(this.deckSeed!);
    await expect
      .poll(() => describeReceived(this.harness.getReceivedCommands()).length, {
        timeout: 120000,
      })
      .toBeGreaterThanOrEqual(expected.length);
    const received = this.harness.getReceivedCommands();
    expect(describeReceived(received)).toEqual(expected);
    // Every pick targets the coordinates its gear was spawned at (the gear's current position).
    let spawnedAt: { x: unknown; y: unknown } | null = null;
    for (const c of received) {
      if (c.type === 'SPAWN_OBJECT') spawnedAt = { x: c.payload.x, y: c.payload.y };
      if (c.type === 'PICK_AND_PLACE_TARGET') {
        expect({ x: c.payload.pick_x, y: c.payload.pick_y }).toEqual(spawnedAt);
      }
    }
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
