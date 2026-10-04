import { createBeltFeeder, type BeltFeeder } from '@utils/beltFeeder';
import {
  BELT_X_RANGE,
  type ConveyorStatus as WireConveyorStatus,
  type GearColor,
  type PickAndPlaceTargetPayload,
  type SpawnObjectPayload,
} from '@contracts';

/** The run was cancelled on purpose (disconnect / FAULT reset): not a failure. */
export class ConveyorAbortedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'ConveyorAbortedError';
  }
}

/** A gear standing in the PickZone with its client-assigned classification. */
export interface GearOnBelt {
  color: GearColor;
  intact: boolean;
  x: number;
  y: number;
}

/** Seams to the session (commands out) and the workcell snapshot (progress in). */
export interface ConveyorPorts {
  spawn: (payload: SpawnObjectPayload) => void;
  pickAndPlace: (payload: PickAndPlaceTargetPayload) => void;
  /** Resolves once the workcell snapshot lists the spawned gear. */
  waitForRegistered: () => Promise<void>;
  /** Resolves once the pick finished and the arm is IDLE again. */
  waitForSettled: () => Promise<void>;
  /** Commands the arm to the HOME pose; resolves once it has arrived and the arm is IDLE. */
  goHome: () => Promise<void>;
}

/** Tracer bullet (Unit 8.0c): one known intact gear at the belt centre of the PickZone. */
export const TRACER_GEAR: GearOnBelt = {
  color: 'GREEN',
  intact: true,
  x: (BELT_X_RANGE[0] + BELT_X_RANGE[1]) / 2,
  y: 0.0,
};

/**
 * Per-gear dispatch (ADR 0005 §4): SPAWN_OBJECT registers the gear in the workcell, then a
 * PICK_AND_PLACE_TARGET at where the gear stands; the workcell routes the drop to its color tower.
 * Defective gears are registered only (the workcell scraps them without arm motion).
 */
export async function dispatchGear(ports: ConveyorPorts, gear: GearOnBelt): Promise<void> {
  ports.spawn({
    x: gear.x,
    y: gear.y,
    z: 0.0,
    object_type: 'GEAR',
    color: gear.color,
    intact: gear.intact,
  });
  if (!gear.intact) return;
  await ports.waitForRegistered();
  ports.pickAndPlace({ pick_x: gear.x, pick_y: gear.y, pick_z: 0.0 });
  await ports.waitForSettled();
}

/** Progress of one Batch across Stop/resume: gears sorted so far decide whether the arm goes HOME. */
export interface BatchProgress {
  sorted: number;
}

/**
 * Sorts one halted Batch gear by gear (lead gear first), then sends the arm HOME. Each gear is
 * taken at its turn (`takeNext`), so one moved after the halt is picked where it now stands.
 * `shouldStop` is checked before each gear: the pick in flight completes, no new one starts, and
 * the call returns false (Batch unfinished; call again with the same `progress` to resume).
 */
export async function processBatch(
  ports: ConveyorPorts,
  takeNext: () => GearOnBelt | undefined,
  shouldStop: () => boolean = () => false,
  progress: BatchProgress = { sorted: 0 },
): Promise<boolean> {
  while (!shouldStop()) {
    const gear = takeNext();
    if (!gear) {
      if (progress.sorted > 0) await ports.goHome();
      return true;
    }
    await dispatchGear(ports, { color: gear.color, intact: gear.intact, x: gear.x, y: gear.y });
    progress.sorted += 1;
  }
  return false;
}

/** Cell flow status (ADR 0006); the same enum `cell_state` carries on the wire. */
export type ConveyorStatus = WireConveyorStatus;

export const DECK_SIZE = 100;
const DEFECTIVE_COUNT = 10;
const INTACT_PER_COLOR = 30;
const GEAR_COLORS: readonly GearColor[] = ['WHITE', 'GREEN', 'BLUE'];

/** A deck entry: classification only, position is assigned when it rides the belt. */
export interface GearSpec {
  color: GearColor;
  intact: boolean;
}

/** Small seedable PRNG (mulberry32) so tests and E2E get a reproducible deck. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fill: exactly 10 defective (random color) + 30/30/30 intact, Fisher-Yates shuffled. */
export function buildDeck(seed: number = Date.now()): GearSpec[] {
  const rand = seededRandom(seed);
  const deck: GearSpec[] = [];
  for (const color of GEAR_COLORS) {
    for (let i = 0; i < INTACT_PER_COLOR; i++) deck.push({ color, intact: true });
  }
  for (let i = 0; i < DEFECTIVE_COUNT; i++) {
    deck.push({ color: GEAR_COLORS[Math.floor(rand() * GEAR_COLORS.length)], intact: false });
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export const canFill = (status: ConveyorStatus): boolean => status === 'EMPTY';
/** Process runs the whole deck (a freshly filled, full hopper) or resumes a stopped run. */
export const canProcess = (status: ConveyorStatus, hopperCount: number): boolean =>
  status === 'STOPPED' || (status === 'LOADED' && hopperCount === DECK_SIZE);
/** Stop freezes a running belt; it has nothing to do before Process or after the run. */
export const canStop = (status: ConveyorStatus): boolean =>
  status === 'FEEDING' || status === 'HALTED';

/** Where a deck run stands, so Stop can freeze it and Process resume it. */
export interface DeckRun {
  hopper: readonly GearSpec[];
  previous: BeltFeeder | null;
  /** The Batch on the belt (feeding, or halted and not fully sorted); null between Batches. */
  current: BeltFeeder | null;
  batch: BatchProgress;
  index: number;
}

export function createDeckRun(deck: readonly GearSpec[]): DeckRun {
  return { hopper: deck, previous: null, current: null, batch: { sorted: 0 }, index: 0 };
}

/** Seams for `runDeck`: everything beyond the belt logic itself. */
export interface DeckRunDeps {
  ports: ConveyorPorts;
  /** Seed for the Batch sizes and belt randomness; Batch n uses `seed + n`. */
  seed: number;
  /** Advances the feeder in real (or fake) time; resolves once it has halted or `shouldStop`. */
  feedUntilHalted: (feeder: BeltFeeder) => Promise<void>;
  /** Throws when the run was aborted (disconnect / FAULT reset). Checked between phases. */
  assertActive: () => void;
  /** True once the operator pressed Stop (UI-only; the arm is never commanded to stop). */
  shouldStop?: () => boolean;
  onFeeder: (feeder: BeltFeeder) => void;
  onStatus: (status: ConveyorStatus) => void;
}

/**
 * Processes ALL gears of the deck: feed a Batch → halt → sort it gear by gear → arm HOME → next
 * Batch, then a final flush run so leftover defectives leave the belt. Ends with the hopper and
 * belt empty (status EMPTY). Rejects if any port rejects; nothing is swallowed here.
 *
 * On Stop the belt freezes, the pick in flight completes and the run returns 'STOPPED' (status
 * STOPPED) with `run` holding its progress; calling `runDeck` with the same `run` resumes it.
 */
export async function runDeck(
  deckOrRun: readonly GearSpec[] | DeckRun,
  deps: DeckRunDeps,
): Promise<'DONE' | 'STOPPED'> {
  const { ports, seed, feedUntilHalted, assertActive, onFeeder, onStatus } = deps;
  const shouldStop = deps.shouldStop ?? (() => false);
  const run = Array.isArray(deckOrRun) ? createDeckRun(deckOrRun) : (deckOrRun as DeckRun);
  const stopped = (): 'STOPPED' => {
    onStatus('STOPPED');
    return 'STOPPED';
  };
  while (run.current || run.hopper.length > 0 || (run.previous?.gears().length ?? 0) > 0) {
    assertActive();
    if (shouldStop()) return stopped();
    if (!run.current) {
      const prev = run.previous;
      run.current = createBeltFeeder(
        run.hopper,
        seed + run.index,
        prev ? { gears: prev.gears(), scroll: prev.scroll() } : undefined,
      );
    }
    const feeder = run.current;
    onFeeder(feeder);
    if (feeder.status() === 'FEEDING') {
      onStatus('FEEDING');
      await feedUntilHalted(feeder);
      assertActive();
      if (shouldStop()) return stopped();
    }
    onStatus('HALTED');
    const finished = await processBatch(ports, feeder.next, shouldStop, run.batch);
    assertActive();
    if (!finished) return stopped();
    run.hopper = feeder.remaining();
    run.previous = feeder;
    run.current = null;
    run.batch = { sorted: 0 };
    run.index += 1;
  }
  onStatus('EMPTY');
  return 'DONE';
}
