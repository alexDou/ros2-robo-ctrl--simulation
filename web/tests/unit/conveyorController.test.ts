import { describe, it, expect } from 'vitest';
import { BELT_X_RANGE, PICK_ZONE_Y_RANGE } from '@contracts';
import type { BeltFeeder } from '@utils/beltFeeder';
import {
  DECK_SIZE,
  TRACER_GEAR,
  buildDeck,
  canFill,
  canProcess,
  dispatchGear,
  processBatch,
  runDeck,
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
    goHome: async () => {
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
      expect(canProcess(s, DECK_SIZE)).toBe(s === 'LOADED');
    }
  });

  it('Process needs a full hopper: it runs the whole deck', () => {
    expect(canProcess('LOADED', DECK_SIZE)).toBe(true);
    expect(canProcess('LOADED', DECK_SIZE - 1)).toBe(false);
    expect(canProcess('LOADED', 0)).toBe(false);
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

/** Fake clock: 20 ms ticks until the feeder halts. */
const feedFast = async (feeder: BeltFeeder): Promise<void> => {
  for (let t = 0; feeder.status() === 'FEEDING' && t < 600; t += 0.02) feeder.step(0.02);
};

interface DeckRun {
  events: string[];
  spawns: Array<{ color: string; intact: boolean; x: number; y: number }>;
  picks: Array<{ pick_x: number; pick_y: number }>;
  statuses: ConveyorStatus[];
  beltAtHalt: number[];
  beltAtEnd: number;
}

async function runSeededDeck(seed: number, deck: GearSpec[] = buildDeck(seed)): Promise<DeckRun> {
  const run: DeckRun = {
    events: [],
    spawns: [],
    picks: [],
    statuses: [],
    beltAtHalt: [],
    beltAtEnd: -1,
  };
  let feeder: BeltFeeder | null = null;
  const ports: ConveyorPorts = {
    spawn: (p) => {
      run.events.push('spawn');
      run.spawns.push({ color: p.color, intact: p.intact, x: p.x, y: p.y });
    },
    pickAndPlace: (p) => {
      run.events.push('pick');
      run.picks.push({ pick_x: p.pick_x, pick_y: p.pick_y });
    },
    waitForRegistered: async () => undefined,
    waitForSettled: async () => {
      run.events.push('idle');
    },
    goHome: async () => {
      run.events.push('home');
    },
  };
  await runDeck(deck, {
    ports,
    seed,
    feedUntilHalted: async (f) => {
      await feedFast(f);
      run.beltAtHalt.push(f.gears().length);
    },
    assertActive: () => undefined,
    onFeeder: (f) => {
      feeder = f;
    },
    onStatus: (st) => run.statuses.push(st),
  });
  run.beltAtEnd = feeder!.gears().length;
  return run;
}

describe('Unit 8.2c: Process runs the whole deck (hand-sim-as72)', () => {
  it('spawns every gear once and picks exactly the intact ones, at the coordinates it was spawned', async () => {
    const run = await runSeededDeck(7);
    expect(run.spawns).toHaveLength(DECK_SIZE);
    expect(run.spawns.filter((g) => g.intact)).toHaveLength(90);
    expect(run.picks).toHaveLength(90);
    const intactSpawns = run.spawns.filter((g) => g.intact);
    run.picks.forEach((p, i) => {
      expect(p).toEqual({ pick_x: intactSpawns[i].x, pick_y: intactSpawns[i].y });
    });
  });

  it('waits for IDLE after every pick and sends the arm HOME once per Batch that moved it', async () => {
    const run = await runSeededDeck(7);
    run.events.forEach((e, i) => {
      if (e === 'pick') expect(run.events[i + 1]).toBe('idle');
    });
    const homes = run.events.filter((e) => e === 'home').length;
    expect(homes).toBeGreaterThanOrEqual(1);
    expect(homes).toBeLessThanOrEqual(run.beltAtHalt.length);
    expect(run.events.at(-1)).toBe('home');
  });

  it('status alternates FEEDING/HALTED per run and ends EMPTY with an empty belt', async () => {
    const run = await runSeededDeck(7);
    expect(run.statuses.at(-1)).toBe('EMPTY');
    const pairs = run.statuses.slice(0, -1);
    pairs.forEach((st, i) => expect(st).toBe(i % 2 === 0 ? 'FEEDING' : 'HALTED'));
    expect(run.beltAtEnd).toBe(0);
  });

  it('keeps defective gears on the belt after their turn and carries them into the next run', async () => {
    const deck: GearSpec[] = [
      { color: 'WHITE', intact: false },
      { color: 'GREEN', intact: false },
      { color: 'BLUE', intact: false },
      { color: 'BLUE', intact: true },
    ];
    // All-defective first Batch is possible only when it takes the first 3 gears.
    const run = await runSeededDeck(3, deck);
    expect(run.spawns.filter((g) => !g.intact)).toHaveLength(3);
    expect(run.beltAtEnd).toBe(0);
    // Whatever was carried between runs has left the belt by the end (flush).
    expect(run.statuses.at(-1)).toBe('EMPTY');
  });

  it('propagates a port failure instead of swallowing it', async () => {
    const deck = buildDeck(7);
    const { ports } = fakePorts();
    const failing: ConveyorPorts = {
      ...ports,
      waitForSettled: async () => {
        throw new Error('arm did not settle');
      },
    };
    await expect(
      runDeck(deck, {
        ports: failing,
        seed: 7,
        feedUntilHalted: feedFast,
        assertActive: () => undefined,
        onFeeder: () => undefined,
        onStatus: () => undefined,
      }),
    ).rejects.toThrow('arm did not settle');
  });

  it('stops between phases when the run was aborted', async () => {
    const { ports, calls } = fakePorts();
    let active = true;
    await expect(
      runDeck(buildDeck(7), {
        ports,
        seed: 7,
        feedUntilHalted: async (f) => {
          await feedFast(f);
          active = false; // FAULT / disconnect while the belt was running
        },
        assertActive: () => {
          if (!active) throw new Error('aborted');
        },
        onFeeder: () => undefined,
        onStatus: () => undefined,
      }),
    ).rejects.toThrow('aborted');
    expect(calls).toEqual([]);
  });
});

describe('Unit 8.2c: workcell progress helpers (hand-sim-as72)', () => {
  it('isAtPose compares every joint within tolerance', async () => {
    const { isAtPose } = await import('@utils/workcellProgress');
    expect(isAtPose([0, 1, 2], [0, 1, 2])).toBe(true);
    expect(isAtPose([0, 1, 2.04], [0, 1, 2])).toBe(true);
    expect(isAtPose([0, 1, 2.2], [0, 1, 2])).toBe(false);
    expect(isAtPose(undefined, [0])).toBe(false);
    expect(isAtPose([0], [0, 1])).toBe(false);
  });

  it('a pick is settled only when the arm is IDLE and no gear is spawned or in flight', async () => {
    const { isPickSettled } = await import('@utils/workcellProgress');
    expect(isPickSettled('IDLE', { spawned: [], inProgress: [] })).toBe(true);
    expect(isPickSettled('IDLE', { spawned: [{}], inProgress: [] })).toBe(false);
    expect(isPickSettled('IDLE', { spawned: [], inProgress: [{}] })).toBe(false);
    expect(isPickSettled('EXECUTING', { spawned: [], inProgress: [] })).toBe(false);
  });
});
