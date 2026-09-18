import { Page, Locator, expect } from '@playwright/test';
import { CANONICAL_UR5E_JOINTS } from '@contracts';

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
  readonly poseReadyButton: Locator;
  readonly poseInspectButton: Locator;
  readonly palmToggleButton: Locator;
  readonly palmStatusBadge: Locator;
  readonly resetFaultButton: Locator;
  readonly emergencyStopButton: Locator;
  readonly clearWorkspaceButton: Locator;
  readonly toolbarErrorBanner: Locator;
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
    this.poseReadyButton = page.getByTestId('pose-ready-button');
    this.poseInspectButton = page.getByTestId('pose-inspect-button');
    this.palmToggleButton = page.getByTestId('palm-toggle-button');
    this.palmStatusBadge = page.getByTestId('palm-status');
    this.resetFaultButton = page.getByTestId('reset-fault-button');
    this.emergencyStopButton = page.getByTestId('emergency-stop-button');
    this.clearWorkspaceButton = page.getByTestId('clear-workspace-button');
    this.toolbarErrorBanner = page.getByTestId('toolbar-error-banner');
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
      const ws = (window as unknown as { __teleop_ws?: WebSocket }).__teleop_ws;
      if (!ws) throw new Error('Active WebSocket instance not found on window.__teleop_ws');
      ws.send(raw);
    }, payload);
  }

  async expectErrorDiagnostic(code: string, message: string, timeout = 5000): Promise<void> {
    await expect(this.errorLogItem).toBeVisible({ timeout });
    await expect(this.errorLogItem).toContainText(`[ERROR: ${code}]`);
    await expect(this.errorLogItem).toContainText(message);
  }

  async expectTelemetryFrequencyRange(minHz: number, maxHz: number, timeout = 10000): Promise<void> {
    await expect
      .poll(
        async () => {
          const text = await this.frequencyReadout.innerText();
          const match = text.match(/(\d+)\s*Hz/);
          return match ? parseInt(match[1], 10) : 0;
        },
        { timeout, message: `Expected telemetry frequency between ${minHz} and ${maxHz} Hz` }
      )
      .toBeGreaterThanOrEqual(minHz);

    await expect
      .poll(
        async () => {
          const text = await this.frequencyReadout.innerText();
          const match = text.match(/(\d+)\s*Hz/);
          return match ? parseInt(match[1], 10) : 0;
        },
        { timeout, message: `Expected telemetry frequency between ${minHz} and ${maxHz} Hz` }
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
        { timeout, message: `Expected telemetry latency below ${maxMs} ms` }
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
            const handle = (window as unknown as {
              __robot_visualizer?: { isLoaded: () => boolean };
            }).__robot_visualizer;
            return handle ? handle.isLoaded() : false;
          });
        },
        {
          timeout,
          message: 'URDF robot model failed to load into Three.js scene within timeout',
        }
      )
      .toBe(true);
  }

  async getRobotJointValues(): Promise<Record<string, number>> {
    return await this.page.evaluate(() => {
      const handle = (window as unknown as {
        __robot_visualizer?: { getJointValues: () => Record<string, number> };
      }).__robot_visualizer;
      return handle ? handle.getJointValues() : {};
    });
  }

  async getLinkWorldPosition(
    linkName: string
  ): Promise<{ x: number; y: number; z: number } | null> {
    return await this.page.evaluate((name) => {
      const handle = (window as unknown as {
        __robot_visualizer?: {
          getLinkWorldPosition: (n: string) => { x: number; y: number; z: number } | null;
        };
      }).__robot_visualizer;
      return handle ? handle.getLinkWorldPosition(name) : null;
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
    minDelta = 0.005
  ): Promise<void> {
    const p1 = await this.getLinkWorldPosition(linkName);
    expect(p1).not.toBeNull();
    await this.page.waitForTimeout(durationMs);
    const p2 = await this.getLinkWorldPosition(linkName);
    expect(p2).not.toBeNull();

    const distance = Math.hypot(p2!.x - p1!.x, p2!.y - p1!.y, p2!.z - p1!.z);
    expect(distance).toBeGreaterThanOrEqual(minDelta);
  }

  async expectSidebarInSyncWithVisualizer(toleranceRad = 0.05, timeout = 5000): Promise<void> {
    await expect
      .poll(
        async () => {
          return await this.page.evaluate((joints) => {
            const handle = (window as unknown as {
              __robot_visualizer?: { getJointValues: () => Record<string, number> };
            }).__robot_visualizer;
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
        }
      )
      .toBeLessThanOrEqual(toleranceRad);
  }

  async getRendererMemoryInfo(): Promise<{ geometries: number; textures: number; calls: number } | null> {
    return await this.page.evaluate(() => {
      const handle = (window as unknown as {
        __robot_visualizer?: {
          getRendererInfo: () => {
            memory: { geometries: number; textures: number };
            render: { calls: number };
          } | null;
        };
      }).__robot_visualizer;
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
      const handle = (window as unknown as {
        __robot_visualizer?: { isDisposed: () => boolean };
      }).__robot_visualizer;
      return handle ? handle.isDisposed() : true;
    });
    expect(isDisposed).toBe(true);
  }

  async clickCannedPose(name: 'Home' | 'Ready' | 'Inspect'): Promise<void> {
    const btn =
      name === 'Home'
        ? this.poseHomeButton
        : name === 'Ready'
          ? this.poseReadyButton
          : this.poseInspectButton;
    await expect(btn).toBeEnabled();
    await btn.click();
  }

  async clickPalmToggle(): Promise<void> {
    await expect(this.palmToggleButton).toBeEnabled();
    await this.palmToggleButton.click();
  }

  async clickEmergencyStop(): Promise<void> {
    await expect(this.emergencyStopButton).toBeEnabled();
    await this.emergencyStopButton.click();
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
    await expect(this.poseReadyButton).toBeDisabled();
    await expect(this.poseInspectButton).toBeDisabled();
    await expect(this.palmToggleButton).toBeDisabled();
  }

  async expectActionButtonsEnabled(): Promise<void> {
    await expect(this.poseHomeButton).toBeEnabled();
    await expect(this.poseReadyButton).toBeEnabled();
    await expect(this.poseInspectButton).toBeEnabled();
    await expect(this.palmToggleButton).toBeEnabled();
  }

  async expectResetFaultButtonDisabled(): Promise<void> {
    await expect(this.resetFaultButton).toBeDisabled();
  }

  async expectResetFaultButtonEnabled(): Promise<void> {
    await expect(this.resetFaultButton).toBeEnabled();
  }

  async expectEmergencyStopButtonEnabled(): Promise<void> {
    await expect(this.emergencyStopButton).toBeEnabled();
  }

  async expectPalmStatus(status: string, timeout = 5000): Promise<void> {
    await expect(this.palmStatusBadge).toHaveText(status, { timeout });
  }

  async expectPalmButtonText(text: string, timeout = 5000): Promise<void> {
    await expect(this.palmToggleButton).toHaveText(text, { timeout });
  }

  async expectPalmNozzleHighlighted(isGrasped: boolean, timeout = 5000): Promise<void> {
    await expect
      .poll(
        async () => {
          return await this.page.evaluate(() => {
            const handle = (window as unknown as {
              __robot_visualizer?: {
                getPalmNozzleState?: () => {
                  isGrasped: boolean;
                  emissiveHex: number;
                  emissiveIntensity: number;
                } | null;
              };
            }).__robot_visualizer;
            const state = handle?.getPalmNozzleState?.();
            if (!state) return null;
            return state.isGrasped;
          });
        },
        { timeout, message: `Expected palm nozzle highlight state to be ${isGrasped}` }
      )
      .toBe(isGrasped);
  }

  async expectRobotAtPose(
    expectedPositions: number[],
    toleranceRad = 0.05,
    timeout = 10000
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
        { timeout, message: `Expected robot to reach pose within ${toleranceRad} rad` }
      )
      .toBeLessThanOrEqual(toleranceRad);
  }

  async expectWorkcellTableLoaded(timeout = 10000): Promise<void> {
    await expect
      .poll(
        async () => {
          return await this.page.evaluate(() => {
            const handle = (window as unknown as {
              __robot_visualizer?: { getTableMesh: () => unknown };
            }).__robot_visualizer;
            return Boolean(handle && handle.getTableMesh());
          });
        },
        { timeout, message: 'WorkcellTable slab mesh failed to mount in 3D scene' }
      )
      .toBe(true);
  }

  async hasActiveGear(): Promise<boolean> {
    return await this.page.evaluate(() => {
      const handle = (window as unknown as {
        __robot_visualizer?: { hasActiveGear: () => boolean };
      }).__robot_visualizer;
      return handle ? handle.hasActiveGear() : false;
    });
  }

  async expectActiveGear(present: boolean, timeout = 5000): Promise<void> {
    await expect
      .poll(
        async () => {
          return await this.hasActiveGear();
        },
        { timeout, message: `Expected active gear presence in 3D scene to be ${present}` }
      )
      .toBe(present);
  }

  async getGearPosition(): Promise<{ x: number; y: number; z: number } | null> {
    return await this.page.evaluate(() => {
      const handle = (window as unknown as {
        __robot_visualizer?: { getGearPosition: () => { x: number; y: number; z: number } | null };
      }).__robot_visualizer;
      return handle ? handle.getGearPosition() : null;
    });
  }

  async expectGearwheelAtPosition(
    expectedX: number,
    expectedY: number,
    tolerance = 0.05,
    timeout = 5000
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
        }
      )
      .toBeLessThanOrEqual(tolerance);
  }

  async expectClickLockedOut(lockedOut: boolean, timeout = 5000): Promise<void> {
    await expect
      .poll(
        async () => {
          return await this.page.evaluate(() => {
            const handle = (window as unknown as {
              __robot_visualizer?: { isLockedOut: () => boolean };
            }).__robot_visualizer;
            return handle ? handle.isLockedOut() : false;
          });
        },
        { timeout, message: `Expected visualizer isLockedOut to be ${lockedOut}` }
      )
      .toBe(lockedOut);
  }

  async clickWorkcellTable(x: number, y: number): Promise<void> {
    const coords = await this.page.evaluate(
      ({ targetX, targetY }) => {
        const handle = (window as unknown as {
          __robot_visualizer?: {
            getTableScreenCoords?: (x: number, y: number) => { clientX: number; clientY: number } | null;
          };
        }).__robot_visualizer;
        return handle?.getTableScreenCoords?.(targetX, targetY) ?? null;
      },
      { targetX: x, targetY: y }
    );

    if (coords) {
      await this.page.mouse.click(coords.clientX, coords.clientY);
    } else {
      await this.page.evaluate(
        ({ targetX, targetY }) => {
          const handle = (window as unknown as {
            __robot_visualizer?: {
              simulateClick?: (x: number, y: number) => boolean;
            };
          }).__robot_visualizer;
          handle?.simulateClick?.(targetX, targetY);
        },
        { targetX: x, targetY: y }
      );
    }
  }

  async hoverWorkcellTable(x: number, y: number): Promise<void> {
    const coords = await this.page.evaluate(
      ({ targetX, targetY }) => {
        const handle = (window as unknown as {
          __robot_visualizer?: {
            getTableScreenCoords?: (x: number, y: number) => { clientX: number; clientY: number } | null;
          };
        }).__robot_visualizer;
        return handle?.getTableScreenCoords?.(targetX, targetY) ?? null;
      },
      { targetX: x, targetY: y }
    );

    if (coords) {
      await this.page.mouse.move(coords.clientX, coords.clientY);
    } else {
      await this.page.evaluate(
        ({ targetX, targetY }) => {
          const handle = (window as unknown as {
            __robot_visualizer?: {
              simulatePointerMove?: (x: number, y: number) => void;
            };
          }).__robot_visualizer;
          handle?.simulatePointerMove?.(targetX, targetY);
        },
        { targetX: x, targetY: y }
      );
    }
  }

  async isReticleVisible(): Promise<boolean> {
    return await this.page.evaluate(() => {
      const handle = (window as unknown as {
        __robot_visualizer?: {
          getReticleMesh?: () => { visible: boolean } | null;
        };
      }).__robot_visualizer;
      const reticle = handle?.getReticleMesh?.();
      return reticle ? reticle.visible : false;
    });
  }

  async expectReticleVisible(visible: boolean, timeout = 5000): Promise<void> {
    await expect
      .poll(
        async () => {
          return await this.isReticleVisible();
        },
        { timeout, message: `Expected reticle visibility to be ${visible}` }
      )
      .toBe(visible);
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
        { timeout, message: `Expected action progress bar to reach at least ${minPercent}%` }
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
        { timeout, message: 'Expected action progress bar to reach 100%' }
      )
      .toBe(100);
  }

  async isGearAttached(): Promise<boolean> {
    return await this.page.evaluate(() => {
      const handle = (window as unknown as {
        __robot_visualizer?: { isGearAttached: () => boolean; wasGearEverAttached?: () => boolean };
      }).__robot_visualizer;
      if (!handle) return false;
      return Boolean(handle.wasGearEverAttached ? handle.wasGearEverAttached() : handle.isGearAttached());
    });
  }

  async expectGearAttached(attached: boolean, timeout = 10000): Promise<void> {
    await expect
      .poll(
        async () => {
          return await this.isGearAttached();
        },
        { timeout, intervals: [30, 60, 100], message: `Expected gear attached to tool flange to be ${attached}` }
      )
      .toBe(attached);
  }

  async expectSpindleTowerLoaded(timeout = 10000): Promise<void> {
    await expect
      .poll(
        async () => {
          return await this.page.evaluate(() => {
            const handle = (window as unknown as {
              __robot_visualizer?: { getSpindleTowerMesh: () => unknown };
            }).__robot_visualizer;
            return Boolean(handle && handle.getSpindleTowerMesh());
          });
        },
        { timeout, message: 'SpindleTower fixture mesh failed to mount in 3D scene' }
      )
      .toBe(true);
  }

  async getTowerGearCount(): Promise<number> {
    return await this.page.evaluate(() => {
      const handle = (window as unknown as {
        __robot_visualizer?: { getTowerGearCount: () => number };
      }).__robot_visualizer;
      return handle ? handle.getTowerGearCount() : 0;
    });
  }

  async expectTowerGearCount(expectedCount: number, timeout = 10000): Promise<void> {
    await expect
      .poll(
        async () => {
          return await this.getTowerGearCount();
        },
        { timeout, intervals: [50, 100, 200], message: `Expected ${expectedCount} gears stacked on SpindleTower` }
      )
      .toBe(expectedCount);
  }

  async getTowerTopGearHeight(): Promise<number | null> {
    return await this.page.evaluate(() => {
      const handle = (window as unknown as {
        __robot_visualizer?: { getTowerGears: () => Array<{ position: { z: number } }> };
      }).__robot_visualizer;
      if (!handle) return null;
      const gears = handle.getTowerGears();
      if (!gears || gears.length === 0) return null;
      return gears[gears.length - 1].position.z;
    });
  }

  async expectTowerTopGearHeight(expectedZ: number, tolerance = 0.005, timeout = 10000): Promise<void> {
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
        }
      )
      .toBeLessThanOrEqual(tolerance);
  }
}
