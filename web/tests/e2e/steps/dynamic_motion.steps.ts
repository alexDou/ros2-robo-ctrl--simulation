import { When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { CustomWorld } from '../support/world';

Then('the 3D robot model should be fully loaded in the WebGL scene', async function (this: CustomWorld) {
  expect(this.teleopPage).toBeDefined();
  await this.teleopPage!.waitForRobotLoaded();
});

Then(
  'all 6 canonical UR5e joints should oscillate dynamically within physical limits',
  async function (this: CustomWorld) {
    expect(this.teleopPage).toBeDefined();
    await this.teleopPage!.expectJointsOscillating(2000, 0.03);
  }
);

Then(
  'the 3D visualizer link coordinates should move dynamically in WebGL space',
  async function (this: CustomWorld) {
    expect(this.teleopPage).toBeDefined();
    await this.teleopPage!.expectLinkCoordinatesMoving('wrist_3_link', 1500, 0.005);
  }
);

Then(
  'the numerical joint angle readouts in the sidebar should update continuously in sync with the 3D canvas',
  async function (this: CustomWorld) {
    expect(this.teleopPage).toBeDefined();
    await this.teleopPage!.expectSidebarInSyncWithVisualizer(0.08);
  }
);

When(
  'dynamic motion streams continuously for {int} seconds',
  async function (this: CustomWorld, seconds: number) {
    expect(this.page).toBeDefined();
    await this.page!.waitForTimeout(seconds * 1000);
  }
);

Then(
  'the WebGL renderer should not accumulate geometry or texture memory leaks',
  async function (this: CustomWorld) {
    expect(this.teleopPage).toBeDefined();
    const info1 = await this.teleopPage!.getRendererMemoryInfo();
    expect(info1).not.toBeNull();
    expect(info1!.geometries).toBeGreaterThan(0);

    // Sample across 2 seconds of continuous dynamic motion
    await this.page!.waitForTimeout(2000);

    const info2 = await this.teleopPage!.getRendererMemoryInfo();
    expect(info2).not.toBeNull();
    // Geometries and textures must remain constant, proving zero GPU allocation leak
    expect(info2!.geometries).toBe(info1!.geometries);
    expect(info2!.textures).toBe(info1!.textures);
  }
);

When(
  'the operator navigates away from the visualizer',
  async function (this: CustomWorld) {
    expect(this.page).toBeDefined();
    await this.page!.goto('about:blank');
  }
);

Then(
  'the WebGL visualizer resources should be cleanly disposed',
  async function (this: CustomWorld) {
    expect(this.teleopPage).toBeDefined();
    await this.teleopPage!.expectCleanVisualizerDisposal();
  }
);
