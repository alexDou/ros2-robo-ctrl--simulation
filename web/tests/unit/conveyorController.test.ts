import { describe, it, expect } from 'vitest';
import { BELT_X_RANGE, PICK_ZONE_Y_RANGE } from '@contracts';
import {
  DECK_SIZE,
  TRACER_GEAR,
  buildDeck,
  canFill,
  canProcess,
  dispatchGear,
  processBatch,
  type ConveyorPorts,
  type ConveyorStatus,
  type GearOnBelt,
  type GearSpec,
} from '@/utils/conveyorController';

function fakePorts(): { ports: ConveyorPorts; calls: string[]; payloads: unknown[] } {
  const calls: string[] = [];
  const payloads: unknown[] = [];
  const ports: ConveyorPorts = {
    spawn: (p) => {
      calls.push('spawn');
      payloads.push(p);
    },
    pickAndPlace: (p) => {
      calls.push('pickAndPlace');
      payloads.push(p);
    },
    waitForRegistered: async () => {
      calls.push('registered');
    },
    waitForSettled: async () => {
      calls.push('settled');
    },
    goHome: () => {
      calls.push('home');
    },
  };
  return { ports, calls, payloads };
}

describe('Unit 8.0c: minimal conveyor controller (hand-sim-rmju)', () => {
  it('spawns an intact gear with its classification, then picks it once registered, then waits to settle', async () => {
    const { ports, calls, payloads } = fakePorts();
    const gear: GearOnBelt = { color: 'BLUE', intact: true, x: 0.4, y: 0.1 };

    await dispatchGear(ports, gear);

    expect(calls).toEqual(['spawn', 'registered', 'pickAndPlace', 'settled']);
    expect(payloads[0]).toEqual({
      x: 0.4,
      y: 0.1,
      z: 0.0,
      object_type: 'GEAR',
      color: 'BLUE',
      intact: true,
    });
    // Pick at the gear; the workcell routes the drop to the gear's color tower.
    expect(payloads[1]).toEqual({ pick_x: 0.4, pick_y: 0.1, pick_z: 0.0 });
  });

  it('spawns a defective gear without commanding an arm pick', async () => {
    const { ports, calls, payloads } = fakePorts();
    await dispatchGear(ports, { color: 'WHITE', intact: false, x: 0.4, y: 0.0 });
    expect(calls).toEqual(['spawn']);
    expect(payloads[0]).toMatchObject({ color: 'WHITE', intact: false, x: 0.4, y: 0.0 });
  });

  it('places the tracer gear inside the PickZone, and it is intact', () => {
    expect(TRACER_GEAR.intact).toBe(true);
    expect(TRACER_GEAR.x).toBeGreaterThanOrEqual(BELT_X_RANGE[0]);
    expect(TRACER_GEAR.x).toBeLessThanOrEqual(BELT_X_RANGE[1]);
    expect(TRACER_GEAR.y).toBeGreaterThanOrEqual(PICK_ZONE_Y_RANGE[0]);
    expect(TRACER_GEAR.y).toBeLessThanOrEqual(PICK_ZONE_Y_RANGE[1]);
  });
});

describe('Unit 8.2a: deck generation and button gating (hand-sim-n5lx)', () => {
  const tally = (deck: GearSpec[]) => {
    const t = { defective: 0, WHITE: 0, GREEN: 0, BLUE: 0 };
    for (const g of deck) {
      if (g.intact) t[g.color] += 1;
      else t.defective += 1;
    }
    return t;
  };

  it.each([1, 2, 42, 12345])('seed %i: 10 defective and 30/30/30 intact', (seed) => {
    const deck = buildDeck(seed);
    expect(deck).toHaveLength(DECK_SIZE);
    const t = tally(deck);
    expect(t).toMatchObject({ defective: 10, WHITE: 30, GREEN: 30, BLUE: 30 });
  });

  it('same seed gives the same order; a different seed shuffles differently', () => {
    expect(buildDeck(7)).toEqual(buildDeck(7));
    expect(buildDeck(7)).not.toEqual(buildDeck(8));
  });

  it('enables Fill only when EMPTY and Process only when LOADED', () => {
    const statuses: ConveyorStatus[] = ['EMPTY', 'LOADED', 'FEEDING', 'HALTED', 'STOPPED'];
    for (const s of statuses) {
      expect(canFill(s)).toBe(s === 'EMPTY');
      expect(canProcess(s)).toBe(s === 'LOADED');
    }
  });
});

describe('Unit 8.2c: sort one halted Batch gear by gear (hand-sim-as72)', () => {
  it('dispatches each gear in order, waiting for IDLE before the next, skips picks for defective, then goes HOME', async () => {
    const { ports, calls } = fakePorts();
    const gears: GearOnBelt[] = [
      { color: 'WHITE', intact: true, x: 0.3, y: 0.5 },
      { color: 'GREEN', intact: false, x: 0.4, y: 0.4 },
      { color: 'BLUE', intact: true, x: 0.5, y: 0.3 },
    ];

    await processBatch(ports, () => gears.shift());

    expect(calls).toEqual([
      'spawn',
      'registered',
      'pickAndPlace',
      'settled',
      'spawn',
      'spawn',
      'registered',
      'pickAndPlace',
      'settled',
      'home',
    ]);
  });

  it('picks a gear at its coordinates at its turn, even if it moved since the halt', async () => {
    const { ports, payloads } = fakePorts();
    const second: GearOnBelt = { color: 'BLUE', intact: true, x: 0.5, y: 0.3 };
    const gears: GearOnBelt[] = [{ color: 'WHITE', intact: true, x: 0.3, y: 0.5 }, second];
    const movingPorts: ConveyorPorts = {
      ...ports,
      waitForSettled: async () => {
        second.x = 0.45; // operator drags the second gear while the first is being sorted
      },
    };

    await processBatch(movingPorts, () => gears.shift());

    expect(payloads[3]).toEqual({ pick_x: 0.45, pick_y: 0.3, pick_z: 0.0 });
  });
});
