import { Page, Locator, expect } from '@playwright/test';
import { CANONICAL_UR5E_JOINTS } from '@contracts';
import type { BeltGearPosition } from '../../../src/components/RobotVisualizer/assets/beltgears';

declare global {
  interface Window {
    /** Largest belt snapshot seen while recording (the full Batch, before sorting empties the belt). */
    __batchMax?: BeltGearPosition[];
    __batchRecorder?: ReturnType<typeof setInterval>;
  }
}

export class TeleopPage {
  readonly page: Page;
  readonly connectionBadge: Locator;
  readonly pingButton: Locator;
  readonly verifyConnectionButton: Locator;
  readonly eventLog: Locator;
  readonly conflictBanner: Locator;
  readonly errorLogItem: Locator;
  readonly telemetryMonitor: Locator;
  readonly frequencyReadout: Locator;
  readonly latencyReadout: Locator;
  readonly visualizerContainer: Locator;
  readonly visualizerCanvas: Locator;
  readonly operatorToolbar: Locator;
  readonly poseHomeButton: Locator;
  readonly resetFaultButton: Locator;
  readonly clearWorkspaceButton: Locator;
  readonly processButton: Locator;
  readonly stopButton: Locator;
  readonly fillButton: Locator;
  readonly toolbarErrorBanner: Locator;
  readonly connectButton: Locator;
  readonly disconnectButton: Locator;
  readonly toolbarDisabledReason: Locator;
  readonly actionProgressContainer: Locator;
  readonly actionProgressBar: Locator;
  readonly actionProgressPhase: Locator;
  readonly actionProgressPercent: Locator;

  constructor(page: Page) {
    this.page = page;
    this.connectionBadge = page.getByTestId('connection-badge');
    this.pingButton = page.getByRole('button', { name: /(ping|verify connection)/i });
    this.verifyConnectionButton = page.getByTestId('verify-connection-button');
    this.eventLog = page.getByTestId('event-log');
    this.conflictBanner = page.getByTestId('conflict-banner');
    this.errorLogItem = page.getByTestId('log-item-error');
    this.telemetryMonitor = page.getByTestId('telemetry-monitor');
    this.frequencyReadout = page.getByTestId('telemetry-frequency');
    this.latencyReadout = page.getByTestId('telemetry-latency');
    this.visualizerContainer = page.getByTestId('robot-visualizer');
    this.visualizerCanvas = page.getByTestId('robot-canvas');
    this.operatorToolbar = page.getByTestId('operator-toolbar');
    this.poseHomeButton = page.getByTestId('pose-home-button');
    this.resetFaultButton = page.getByTestId('reset-fault-button');
    this.clearWorkspaceButton = page.getByTestId('clear-workspace-button');
    this.processButton = page.getByTestId('process-button');
    this.stopButton = page.getByTestId('stop-button');
    this.fillButton = page.getByTestId('fill-button');
    this.toolbarErrorBanner = page.getByTestId('toolbar-error-banner');
    this.connectButton = page.getByTestId('connect-button');
    this.disconnectButton = page.getByTestId('disconnect-button');
    this.toolbarDisabledReason = page.getByTestId('toolbar-disabled-reason');
    this.actionProgressContainer = page.getByTestId('action-progress-container');
    this.actionProgressBar = page.getByTestId('action-progress-bar');
    this.actionProgressPhase = page.getByTestId('action-progress-phase');
    this.actionProgressPercent = page.getByTestId('action-progress-percent');
  }

  async goto(url: string): Promise<void> {
    await this.page.goto(url);
  }

  async expectConnectionStatus(status: string | RegExp, timeout = 10000): Promise<void> {
    await expect(this.connectionBadge).toHaveText(status, { timeout });
  }

  async clickConnect(): Promise<void> {
    await expect(this.connectButton).toBeEnabled();
    await this.connectButton.click();
  }

  async clickDisconnect(): Promise<void> {
    await expect(this.disconnectButton).toBeEnabled();
    await this.disconnectButton.click();
  }

  async clickPing(): Promise<void> {
    await expect(this.pingButton).toBeEnabled();
    await this.pingButton.click();
  }

  async expectEventLogContains(text: string | RegExp, timeout = 5000): Promise<void> {
    await expect(this.eventLog).toContainText(text, { timeout });
  }

  async expectConflictBanner(text: string | RegExp, timeout = 5000): Promise<void> {
    await expect(this.conflictBanner).toBeVisible({ timeout });
    await expect(this.conflictBanner).toContainText(text);
  }

  async injectRawFrame(payload: string): Promise<void> {
    await this.page.evaluate((raw) => {
      const ws = window.__teleop_ws;
      if (!ws) throw new Error('Active WebSocket instance not found on window.__teleop_ws');
      ws.send(raw);
    }, payload);
  }

  async expectErrorDiagnostic(code: string, message: string, timeout = 5000): Promise<void> {
    await expect(this.errorLogItem).toBeVisible({ timeout });
    await expect(this.errorLogItem).toContainText(`[ERROR: ${code}]`);
    await expect(this.errorLogItem).toContainText(message);
  }

  async expectTelemetryFrequencyRange(
    minHz: number,
    maxHz: number,
    timeout = 10000,
  ): Promise<void> {
    await expect
      .poll(
        async () => {
          const text = await this.frequencyReadout.innerText();
          const match = text.match(/(\d+)\s*Hz/);
          return match ? parseInt(match[1], 10) : 0;
        },
        { timeout, message: `Expected telemetry frequency between ${minHz} and ${maxHz} Hz` },
      )
      .toBeGreaterThanOrEqual(minHz);

    await expect
      .poll(
        async () => {
          const text = await this.frequencyReadout.innerText();
          const match = text.match(/(\d+)\s*Hz/);
          return match ? parseInt(match[1], 10) : 0;
        },
        { timeout, message: `Expected telemetry frequency between ${minHz} and ${maxHz} Hz` },
      )
      .toBeLessThanOrEqual(maxHz);
  }

  async expectTelemetryLatencyBelow(maxMs: number, timeout = 10000): Promise<void> {
    await expect
      .poll(
        async () => {
          const text = await this.latencyReadout.innerText();
          const match = text.match(/(\d+)\s*ms/);
          return match ? parseInt(match[1], 10) : 999;
        },
        { timeout, message: `Expected telemetry latency below ${maxMs} ms` },
      )
      .toBeLessThanOrEqual(maxMs);
  }

  async expectCanonicalJointsDisplayed(timeout = 5000): Promise<void> {
    for (const jointName of CANONICAL_UR5E_JOINTS) {
      const jointVal = this.page.getByTestId(`joint-val-${jointName}`);
      await expect(jointVal).toBeVisible({ timeout });
      await expect(jointVal).toHaveText(/^-?\d+\.\d{3}\s+rad\s+\(-?\d+\.\d+°\)$/, { timeout });
    }
  }

  async expectVerifyConnectionControlsRemoved(timeout = 5000): Promise<void> {
    await expect(this.verifyConnectionButton).toBeHidden({ timeout });
  }

  async waitForRobotLoaded(timeout = 15000): Promise<void> {
    await expect(this.visualizerCanvas).toBeVisible({ timeout });
    await expect
      .poll(
        async () => {
          return await this.page.evaluate(() => {
            return window.__robot_visualizer ? window.__robot_visualizer.isLoaded() : false;
          });
        },
        {
          timeout,
          message: 'URDF robot model failed to load into Three.js scene within timeout',
        },
      )
      .toBe(true);
  }

  async getRobotJointValues(): Promise<Record<string, number>> {
    return await this.page.evaluate(() => {
      return window.__robot_visualizer ? window.__robot_visualizer.getJointValues() : {};
    });
  }

  async getLinkWorldPosition(
    linkName: string,
  ): Promise<{ x: number; y: number; z: number } | null> {
    return await this.page.evaluate((name) => {
      return window.__robot_visualizer
        ? window.__robot_visualizer.getLinkWorldPosition(name)
        : null;
    }, linkName);
  }

  async getSidebarJointValues(): Promise<Record<string, number>> {
    const result: Record<string, number> = {};
    for (const jointName of CANONICAL_UR5E_JOINTS) {
      const text = await this.page.getByTestId(`joint-val-${jointName}`).innerText();
      const match = text.match(/^(-?\d+\.\d+)\s*rad/);
      if (match) {
        result[jointName] = parseFloat(match[1]);
      }
    }
    return result;
  }

  async expectJointsOscillating(durationMs = 3000, minDeltaRad = 0.03): Promise<void> {
    const sample1 = await this.getRobotJointValues();
    const maxDeltas: Record<string, number> = {};
    for (const j of CANONICAL_UR5E_JOINTS) {
      maxDeltas[j] = 0;
    }

    const startTime = Date.now();
    while (Date.now() - startTime < durationMs) {
      await this.page.waitForTimeout(100);
      const sample = await this.getRobotJointValues();
      for (const j of CANONICAL_UR5E_JOINTS) {
        if (sample1[j] !== undefined && sample[j] !== undefined) {
          const d = Math.abs(sample[j] - sample1[j]);
          if (d > maxDeltas[j]) maxDeltas[j] = d;
        }
      }
      if (CANONICAL_UR5E_JOINTS.every((j) => maxDeltas[j] >= minDeltaRad)) {
        break;
      }
    }

    for (const jointName of CANONICAL_UR5E_JOINTS) {
      const val = sample1[jointName];
      expect(val).toBeDefined();
      expect(val).toBeGreaterThanOrEqual(-Math.PI);
      expect(val).toBeLessThanOrEqual(Math.PI);
      expect(maxDeltas[jointName]).toBeGreaterThanOrEqual(minDeltaRad);
    }
  }

  async expectLinkCoordinatesMoving(
    linkName = 'wrist_3_link',
    durationMs = 1500,
    minDelta = 0.005,
  ): Promise<void> {
    const p1 = await this.getLinkWorldPosition(linkName);
    expect(p1).not.toBeNull();
    await this.page.waitForTimeout(durationMs);
    const p2 = await this.getLinkWorldPosition(linkName);
    expect(p2).not.toBeNull();

    const distance = Math.hypot(p2!.x - p1!.x, p2!.y - p1!.y, p2!.z - p1!.z);
    expect(distance).toBeGreaterThanOrEqual(minDelta);
  }

  /** The sidebar readouts keep changing while the stream moves (they are the raw telemetry). */
  async expectSidebarUpdating(durationMs = 1000): Promise<void> {
    const read = () =>
      this.page.evaluate(
        (joints) =>
          joints.map(
            (j) => document.querySelector(`[data-testid="joint-val-${j}"]`)?.textContent ?? '',
          ),
        CANONICAL_UR5E_JOINTS,
      );
    const before = await read();
    await this.page.waitForTimeout(durationMs);
    const after = await read();
    expect(after.some((text, i) => text !== before[i])).toBe(true);
  }

  async expectSidebarInSyncWithVisualizer(toleranceRad = 0.05, timeout = 5000): Promise<void> {
    await expect
      .poll(
        async () => {
          return await this.page.evaluate((joints) => {
            const handle = window.__robot_visualizer;
            const vizVals = handle ? handle.getJointValues() : null;
            if (!vizVals) return 999;

            let maxDiff = 0;
            for (const joint of joints) {
              const el = document.querySelector(`[data-testid="joint-val-${joint}"]`);
              if (!el || !el.textContent) return 999;
              const match = el.textContent.match(/^(-?\d+\.\d+)\s*rad/);
              if (!match) return 999;
              const domRad = parseFloat(match[1]);
              const vizRad = vizVals[joint];
              if (typeof vizRad !== 'number') return 999;
              const diff = Math.abs(domRad - vizRad);
              if (diff > maxDiff) maxDiff = diff;
            }
            return maxDiff;
          }, CANONICAL_UR5E_JOINTS);
        },
        {
          timeout,
          message: `Expected sidebar readouts to sync with 3D canvas within ${toleranceRad} rad`,
        },
      )
      .toBeLessThanOrEqual(toleranceRad);
  }

  async getRendererMemoryInfo(): Promise<{
    geometries: number;
    textures: number;
    calls: number;
  } | null> {
    return await this.page.evaluate(() => {
      const handle = window.__robot_visualizer;
      const info = handle?.getRendererInfo();
      return info
        ? {
            geometries: info.memory.geometries,
            textures: info.memory.textures,
            calls: info.render.calls,
          }
        : null;
    });
  }

  async expectCleanVisualizerDisposal(): Promise<void> {
    const isDisposed = await this.page.evaluate(() => {
      return window.__robot_visualizer ? window.__robot_visualizer.isDisposed() : true;
    });
    expect(isDisposed).toBe(true);
  }

  async clickHomePose(): Promise<void> {
    await expect(this.poseHomeButton).toBeEnabled();
    await this.poseHomeButton.click();
  }

  async dispatchEstop(reason: string): Promise<void> {
    await this.injectRawFrame(
      JSON.stringify({
        command_id: `estop-${Date.now()}`,
        sender_id: 'ui-client',
        timestamp_ns: Date.now() * 1_000_000,
        type: 'EMERGENCY_STOP',
        payload: { reason },
      }),
    );
  }

  async expectScrapBinFloorHex(hex: number): Promise<void> {
    await expect
      .poll(() =>
        this.page.evaluate(() => {
          const bin = window.__robot_visualizer!.getScrapBinMesh() as any;
          return bin.getObjectByName('scrap-bin-floor').material.color.getHex();
        }),
      )
      .toBe(hex);
  }

  async expectTowerCounter(color: string, text: string): Promise<void> {
    await expect(this.page.getByTestId(`tower-counter-${color}`)).toHaveText(text);
  }

  async clickFill(): Promise<void> {
    await expect(this.fillButton).toBeEnabled();
    await this.fillButton.click();
  }

  async expectHopperFull(): Promise<void> {
    await expect
      .poll(() => this.page.evaluate(() => window.__robot_visualizer!.getHopperFillLevel()))
      .toBe(1);
  }

  async expectFillDisabledProcessEnabled(): Promise<void> {
    await expect(this.fillButton).toBeDisabled();
    await expect(this.processButton).toBeEnabled();
  }

  async clickProcess(): Promise<void> {
    await expect(this.processButton).toBeEnabled();
    await this.processButton.click();
  }

  async clickStop(): Promise<void> {
    await expect(this.stopButton).toBeEnabled();
    await this.stopButton.click();
  }

  /** STOPPED: the in-flight pick may still finish first, so wait for Process to come back. */
  async expectStopped(): Promise<void> {
    await expect(this.processButton).toBeEnabled({ timeout: 60000 });
    await expect(this.fillButton).toBeDisabled();
    await expect(this.stopButton).toBeDisabled();
    const hopper = await this.page.evaluate(() => window.__robot_visualizer!.getHopperFillLevel());
    expect(hopper).toBeGreaterThan(0);
  }

  async expectBeltMoving(): Promise<void> {
    await expect
      .poll(() => this.page.evaluate(() => window.__robot_visualizer!.getBeltScroll()))
      .toBeGreaterThan(0);
  }

  async expectBatchHaltedInPickZone(): Promise<void> {
    // HALTED: the belt scroll stops advancing.
    await expect
      .poll(
        async () => {
          const a = await this.page.evaluate(() => window.__robot_visualizer!.getBeltScroll());
          await this.page.waitForTimeout(300);
          const b = await this.page.evaluate(() => window.__robot_visualizer!.getBeltScroll());
          return a === b && a > 0;
        },
        { timeout: 15000 },
      )
      .toBe(true);
    // Sorting takes gears off the belt right at the halt, so assert on the last full snapshot.
    const gears = await this.page.evaluate(() => window.__batchMax ?? []);
    expect(gears.length).toBeGreaterThanOrEqual(3);
    expect(gears.length).toBeLessThanOrEqual(10);
    const ys = gears.map((g) => g.y);
    // Last snapshot precedes the halt tick by up to one feeder step (~0.02 m), hence the tolerance.
    expect(Math.min(...ys)).toBeCloseTo(-0.51, 1);
    for (const g of gears) {
      expect(g.y).toBeLessThanOrEqual(0.51);
      expect(g.x).toBeGreaterThanOrEqual(0.25);
      expect(g.x).toBeLessThanOrEqual(0.55);
    }
  }

  /** Record the largest belt snapshot (the full Batch) before sorting empties the belt. */
  async startRecordingBatch(): Promise<void> {
    await this.page.evaluate(() => {
      clearInterval(window.__batchRecorder);
      window.__batchMax = [];
      window.__batchRecorder = setInterval(() => {
        const snap = window.__robot_visualizer!.getBeltGearPositions();
        if (snap.length >= (window.__batchMax?.length ?? 0)) window.__batchMax = snap;
      }, 20);
    });
  }

  async expectRunFinished(): Promise<void> {
    await expect
      .poll(() => this.page.evaluate(() => window.__robot_visualizer!.getHopperFillLevel()), {
        timeout: 120000,
      })
      .toBe(0);
    await expect(this.fillButton).toBeEnabled({ timeout: 60000 });
    await expect(this.processButton).toBeDisabled();
    await expect
      .poll(() =>
        this.page.evaluate(() => window.__robot_visualizer!.getBeltGearPositions().length),
      )
      .toBe(0);
    await expect(this.connectionBadge).toHaveText(/CONNECTED \/ IDLE/);
  }

  async expectSomeGearsSorted(): Promise<void> {
    await expect.poll(() => this.getTowerGearCount(), { timeout: 60000 }).toBeGreaterThan(0);
  }

  async reload(): Promise<void> {
    await this.page.reload();
  }

  async expectEverythingEmpty(): Promise<void> {
    await expect
      .poll(() =>
        this.page.evaluate(() => ({
          hopper: window.__robot_visualizer!.getHopperFillLevel(),
          belt: window.__robot_visualizer!.getBeltGearPositions().length,
          towers: window.__robot_visualizer!.getTowerGearCount(),
        })),
      )
      .toEqual({ hopper: 0, belt: 0, towers: 0 });
    for (const color of ['WHITE', 'GREEN', 'BLUE']) {
      await this.expectTowerCounter(color, `${color}: 0/10`);
    }
    await expect(this.fillButton).toBeEnabled();
    await expect(this.processButton).toBeDisabled();
  }

  async expectBeltFrozen(): Promise<void> {
    const a = await this.page.evaluate(() => window.__robot_visualizer!.getBeltScroll());
    await this.page.waitForTimeout(400);
    const b = await this.page.evaluate(() => window.__robot_visualizer!.getBeltScroll());
    expect(b).toBe(a);
  }

  async expectHopperHoldsRestOfDeck(): Promise<void> {
    const { level, count } = await this.page.evaluate(() => ({
      level: window.__robot_visualizer!.getHopperFillLevel(),
      count: window.__batchMax?.length ?? 0,
    }));
    expect(level).toBeCloseTo((100 - count) / 100, 6);
  }

  async clickClearWorkspace(): Promise<void> {
    await expect(this.clearWorkspaceButton).toBeEnabled();
    await this.clearWorkspaceButton.click();
  }

  async expectClearWorkspaceButtonEnabled(): Promise<void> {
    await expect(this.clearWorkspaceButton).toBeEnabled();
  }

  async expectClearWorkspaceButtonDisabled(): Promise<void> {
    await expect(this.clearWorkspaceButton).toBeDisabled();
  }

  async clickResetFault(): Promise<void> {
    await expect(this.resetFaultButton).toBeEnabled();
    await this.resetFaultButton.click();
  }

  async expectActionButtonsDisabled(): Promise<void> {
    await expect(this.poseHomeButton).toBeDisabled();
  }

  async expectActionButtonsEnabled(): Promise<void> {
    await expect(this.poseHomeButton).toBeEnabled();
  }

  async expectResetFaultButtonDisabled(): Promise<void> {
    await expect(this.resetFaultButton).toBeDisabled();
  }

  async expectResetFaultButtonEnabled(): Promise<void> {
    await expect(this.resetFaultButton).toBeEnabled();
  }

  async expectPalmNozzleHighlighted(isGrasped: boolean, timeout = 5000): Promise<void> {
    await expect
      .poll(
        async () => {
          return await this.page.evaluate(() => {
            const state = window.__robot_visualizer?.getPalmNozzleState();
            if (!state) return null;
            return state.isGrasped;
          });
        },
        { timeout, message: `Expected palm nozzle highlight state to be ${isGrasped}` },
      )
      .toBe(isGrasped);
  }

  async expectRobotAtPose(
    expectedPositions: number[],
    toleranceRad = 0.05,
    timeout = 10000,
  ): Promise<void> {
    await expect
      .poll(
        async () => {
          const vals = await this.getRobotJointValues();
          const keys = CANONICAL_UR5E_JOINTS;
          if (keys.some((k) => typeof vals[k] !== 'number')) return 999;
          let maxDiff = 0;
          for (let i = 0; i < keys.length; i++) {
            const diff = Math.abs(vals[keys[i]] - expectedPositions[i]);
            if (diff > maxDiff) maxDiff = diff;
          }
          return maxDiff;
        },
        { timeout, message: `Expected robot to reach pose within ${toleranceRad} rad` },
      )
      .toBeLessThanOrEqual(toleranceRad);
  }

  async hasActiveGear(): Promise<boolean> {
    return await this.page.evaluate(() => {
      return window.__robot_visualizer ? window.__robot_visualizer.hasActiveGear() : false;
    });
  }

  async expectActiveGear(present: boolean, timeout = 5000): Promise<void> {
    await expect
      .poll(
        async () => {
          return await this.hasActiveGear();
        },
        { timeout, message: `Expected active gear presence in 3D scene to be ${present}` },
      )
      .toBe(present);
  }

  async getGearPosition(): Promise<{ x: number; y: number; z: number } | null> {
    return await this.page.evaluate(() => {
      return window.__robot_visualizer ? window.__robot_visualizer.getGearPosition() : null;
    });
  }

  async expectGearwheelAtPosition(
    expectedX: number,
    expectedY: number,
    tolerance = 0.05,
    timeout = 5000,
  ): Promise<void> {
    await expect
      .poll(
        async () => {
          const pos = await this.getGearPosition();
          if (!pos) return 999;
          const dx = Math.abs(pos.x - expectedX);
          const dy = Math.abs(pos.y - expectedY);
          return Math.hypot(dx, dy);
        },
        {
          timeout,
          message: `Expected gearwheel mesh at (${expectedX}, ${expectedY}) within ${tolerance}m`,
        },
      )
      .toBeLessThanOrEqual(tolerance);
  }

  async expectActionProgressVisible(visible: boolean, timeout = 5000): Promise<void> {
    if (visible) {
      await expect(this.actionProgressContainer).toBeVisible({ timeout });
    } else {
      await expect(this.actionProgressContainer).not.toBeVisible({ timeout });
    }
  }

  async expectActionPhase(phase: string | RegExp, timeout = 5000): Promise<void> {
    await expect(this.actionProgressPhase).toHaveText(phase, { timeout });
  }

  async expectActionPercentAtLeast(minPercent: number, timeout = 5000): Promise<void> {
    await expect
      .poll(
        async () => {
          const val = await this.actionProgressBar.getAttribute('aria-valuenow');
          return val ? parseInt(val, 10) : 0;
        },
        { timeout, message: `Expected action progress bar to reach at least ${minPercent}%` },
      )
      .toBeGreaterThanOrEqual(minPercent);
  }

  async expectActionCompleted(timeout = 10000): Promise<void> {
    await expect
      .poll(
        async () => {
          const val = await this.actionProgressBar.getAttribute('aria-valuenow');
          return val ? parseInt(val, 10) : 0;
        },
        { timeout, message: 'Expected action progress bar to reach 100%' },
      )
      .toBe(100);
  }

  async isGearAttached(): Promise<boolean> {
    return await this.page.evaluate(() => {
      const handle = window.__robot_visualizer;
      if (!handle) return false;
      return Boolean(
        handle.wasGearEverAttached ? handle.wasGearEverAttached() : handle.isGearAttached(),
      );
    });
  }

  async expectGearAttached(attached: boolean, timeout = 10000): Promise<void> {
    await expect
      .poll(
        async () => {
          return await this.isGearAttached();
        },
        {
          timeout,
          intervals: [30, 60, 100],
          message: `Expected gear attached to tool flange to be ${attached}`,
        },
      )
      .toBe(attached);
  }

  async expectSpindleTowerLoaded(timeout = 10000): Promise<void> {
    await expect
      .poll(
        async () => {
          return await this.page.evaluate(() => {
            return Boolean(
              window.__robot_visualizer && window.__robot_visualizer.getSpindleTowerMesh(),
            );
          });
        },
        { timeout, message: 'SpindleTower fixture mesh failed to mount in 3D scene' },
      )
      .toBe(true);
  }

  async getTowerGearCount(): Promise<number> {
    return await this.page.evaluate(() => {
      return window.__robot_visualizer ? window.__robot_visualizer.getTowerGearCount() : 0;
    });
  }

  async getTowerTopGearHeight(): Promise<number | null> {
    return await this.page.evaluate(() => {
      const handle = window.__robot_visualizer;
      if (!handle) return null;
      const gears = handle.getTowerGears() as Array<{ position: { z: number } }>;
      if (!gears || gears.length === 0) return null;
      return gears[gears.length - 1].position.z;
    });
  }

  async expectTowerTopGearHeight(
    expectedZ: number,
    tolerance = 0.005,
    timeout = 10000,
  ): Promise<void> {
    await expect
      .poll(
        async () => {
          const z = await this.getTowerTopGearHeight();
          if (z === null) return 999;
          return Math.abs(z - expectedZ);
        },
        {
          timeout,
          intervals: [50, 100, 200],
          message: `Expected top gear on SpindleTower to be at z=${expectedZ}m within ${tolerance}m`,
        },
      )
      .toBeLessThanOrEqual(tolerance);
  }
}
