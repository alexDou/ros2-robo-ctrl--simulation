import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { CustomWorld } from '../support/world';
import { TeleopPage } from '../pages/TeleopPage';

Given('an operator is actively connected to robot {string}', async function (this: CustomWorld, robotId: string) {
  const url = `http://127.0.0.1:${this.harness.webPort}/?robot_id=${robotId}&gateway_port=${this.harness.gatewayPort}`;
  await this.teleopPage!.goto(url);
  await this.teleopPage!.expectConnectionStatus(/CONNECTED/);
});

When('the operator opens the teleoperation visualizer for robot {string}', async function (this: CustomWorld, robotId: string) {
  const url = `http://127.0.0.1:${this.harness.webPort}/?robot_id=${robotId}&gateway_port=${this.harness.gatewayPort}`;
  await this.teleopPage!.goto(url);
});

Then('the connection status should indicate {string}', async function (this: CustomWorld, status: string) {
  await this.teleopPage!.expectConnectionStatus(new RegExp(status));
});

When('the operator clicks the Ping button', async function (this: CustomWorld) {
  await this.teleopPage!.clickPing();
});

Then('the event log should contain a {string} event with state {string}', async function (this: CustomWorld, eventTag: string, state: string) {
  await this.teleopPage!.expectEventLogContains(eventTag);
  await this.teleopPage!.expectEventLogContains(`State: ${state}`);
});

Then('the EdgeNode ROS2 logger should record receipt of the PING command', async function (this: CustomWorld) {
  await expect
    .poll(() => this.harness.getCapturedLogs(), {
      message: 'ROS2 logger should output received PING command',
      timeout: 5000,
    })
    .toContain('Received PING command');
});

When('another operator attempts to connect to robot {string} in a second browser session', async function (this: CustomWorld, robotId: string) {
  expect(this.browser).toBeDefined();
  this.secondContext = await this.browser!.newContext();
  this.secondPage = await this.secondContext.newPage();
  this.secondTeleopPage = new TeleopPage(this.secondPage);

  const url = `http://127.0.0.1:${this.harness.webPort}/?robot_id=${robotId}&gateway_port=${this.harness.gatewayPort}`;
  await this.secondTeleopPage.goto(url);
});

Then('the second session connection status should indicate {string}', async function (this: CustomWorld, status: string) {
  expect(this.secondTeleopPage).toBeDefined();
  await this.secondTeleopPage!.expectConnectionStatus(new RegExp(status));
});

Then('a conflict banner should state {string}', async function (this: CustomWorld, bannerText: string) {
  expect(this.secondTeleopPage).toBeDefined();
  await this.secondTeleopPage!.expectConflictBanner(bannerText);
});

When('the operator dispatches a malformed raw payload {string}', async function (this: CustomWorld, payload: string) {
  await this.teleopPage!.injectRawFrame(payload);
});

When('the operator dispatches a PING command', async function (this: CustomWorld) {
  const pingCmd = {
    command_id: `ping-${Date.now()}`,
    sender_id: 'ui-client',
    timestamp_ns: Date.now() * 1_000_000,
    type: 'PING',
    payload: {},
  };
  await this.teleopPage!.injectRawFrame(JSON.stringify(pingCmd));
});

Then('the event log should contain an error diagnostic {string} with message {string}', async function (this: CustomWorld, code: string, message: string) {
  await this.teleopPage!.expectErrorDiagnostic(code, message);
});

Then('the telemetry streaming frequency should be approximately {int} Hz', async function (this: CustomWorld, targetHz: number) {
  await this.teleopPage!.expectTelemetryFrequencyRange(targetHz - 10, targetHz + 10);
});

Then('the telemetry latency should remain below {int} ms', async function (this: CustomWorld, maxMs: number) {
  await this.teleopPage!.expectTelemetryLatencyBelow(maxMs);
});

Then('all 6 canonical UR5e joint readouts should update accurately in the DOM', async function (this: CustomWorld) {
  await this.teleopPage!.expectCanonicalJointsDisplayed();
});

Then('the connection verification controls should be removed from the DOM', async function (this: CustomWorld) {
  await this.teleopPage!.expectVerifyConnectionControlsRemoved();
});
