import {
  BELT_CAPACITY,
  BELT_SPEED_M_S,
  BELT_X_RANGE,
  BELT_Y_RANGE,
  BIN_EXCHANGE_THRESHOLD,
  PALLET_CAPACITY,
  PICK_ZONE_Y_RANGE,
  type BeltGear,
  type CellState,
  type ConveyorStatus,
  type ExchangeState,
  type GearColor,
  type StationName,
} from '../../../domain/contracts';

const STATIONS: readonly StationName[] = ['WHITE', 'GREEN', 'BLUE', 'SCRAP'];
/** Nominal exchange legs in seconds of cell time (D29: PalletExchange ~6 s, BinExchange ~8 s). */
const EXCHANGE_LEGS: Record<'PALLET' | 'BIN', { leave: number; away: number; back: number }> = {
  PALLET: { leave: 2, away: 2, back: 2 },
  BIN: { leave: 3, away: 2, back: 3 },
};

/** What the owner books in WorkcellNode terms: a Rejected that fell into the bin, a station emptied. */
export type CellEvent =
  | { kind: 'scrapped'; gear: BeltGear }
  | { kind: 'emptied'; station: StationName };

const DECK_SIZE = 100;
const DEFECTIVE_COUNT = 10;
const INTACT_PER_COLOR = 30;
const GEAR_COLORS: readonly GearColor[] = ['WHITE', 'GREEN', 'BLUE'];
const MIN_BATCH = 3;
/** Gears drop onto the belt at the FlexFeeder's Y. */
const FEEDER_EXIT_Y = 0.85;
/** Two lanes more than the minimum gear spacing apart; the Y gap keeps same-lane gears apart. */
const LANE_HALF_WIDTH = 0.02;
const LANE_A_X = BELT_X_RANGE[0] + 0.04;
const LANE_B_X = BELT_X_RANGE[1] - 0.04;
const GAP_MIN_M = 0.13 / 2 + 0.005;
const GAP_MAX_M = 0.1;

interface GearSpec {
  color: GearColor;
  intact: boolean;
}

/** Small seedable PRNG (mulberry32) so E2E gets a reproducible deck. */
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

/** Exactly 10 defective (random colour) + 30/30/30 intact, shuffled. */
function buildDeck(rand: () => number): GearSpec[] {
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

/**
 * Pure, clock-free stand-in for the cell_orchestrator's flow: Fill loads a deck, Process feeds one
 * Batch at a time until the lead intact gear reaches the PickZone edge and halts the belt, and the
 * owner sorts the Batch gear by gear through `takeNext`. Defectives are never in a Batch: they ride
 * past the eye and fall into the bin on whichever run carries them off the end (D35), so a feed run
 * keeps placing until it carries an intact gear. Stop (D30) ends the placing but lets the run bring
 * its intact gear to the PickZone edge (or a flush run out); Process resumes.
 */
export class MockCell {
  private status: ConveyorStatus = 'EMPTY';
  private seed = 1;
  private rand = seededRandom(1);
  private hopper: GearSpec[] = [];
  /** Defectives, Rejected at placement: they ride past the eye and tip off the exit end (D35). */
  private carried: BeltGear[] = [];
  /** The Batch: intact gears only. */
  private unsorted: BeltGear[] = [];
  private spawned = 0;
  private batchSize = 0;
  private nextGap = 0;
  private offsetM = 0;
  private halted = false;
  /** Stopped while the belt still runs on to the edge (D30). */
  private finishing = false;
  private counts: Record<StationName, number> = { WHITE: 0, GREEN: 0, BLUE: 0, SCRAP: 0 };
  /** Running exchanges, by cell time elapsed in them. */
  private exchanges = new Map<StationName, number>();
  /** The SortCycle's PalletExchange: no next cycle, no next run until it is HOME (D8). */
  private awaitingPallet: StationName | null = null;
  private events: CellEvent[] = [];
  private idCounter = 0;

  /** Seed for the next Fill's deck and Batch sizes. */
  public setSeed(seed: number): void {
    this.seed = seed;
  }

  public getStatus(): ConveyorStatus {
    return this.status;
  }

  public reset(): void {
    this.status = 'EMPTY';
    this.rand = seededRandom(this.seed);
    this.hopper = [];
    this.carried = [];
    this.unsorted = [];
    this.spawned = 0;
    this.batchSize = 0;
    this.nextGap = 0;
    this.offsetM = 0;
    this.halted = false;
    this.finishing = false;
    this.counts = { WHITE: 0, GREEN: 0, BLUE: 0, SCRAP: 0 };
    this.exchanges.clear();
    this.awaitingPallet = null;
    this.events = [];
  }

  /** The arm committed an intact drop: the 10th on a Pallet starts its PalletExchange. */
  public commitDrop(color: GearColor): void {
    this.counts[color] += 1;
    if (this.counts[color] >= PALLET_CAPACITY) {
      this.awaitingPallet = color;
      this.exchanges.set(color, 0);
    }
  }

  /** Test seam: the Pallet already holds `count` Gearwheels. */
  public seedPalletCount(color: GearColor, count: number): void {
    this.counts[color] = count;
  }

  /** Events since the last call, oldest first. */
  public drainEvents(): CellEvent[] {
    return this.events.splice(0);
  }

  /** EmergencyStop (D31): everything stays where it is; only a flush reset clears it. */
  public emergencyStop(): void {
    this.status = 'FAULT';
    this.finishing = false;
  }

  public fill(): void {
    if (this.status !== 'EMPTY') return;
    this.rand = seededRandom(this.seed);
    this.hopper = buildDeck(this.rand).slice(0, DECK_SIZE);
    this.status = 'LOADED';
  }

  public process(): void {
    if (this.status === 'LOADED') {
      this.startRun();
    } else if (this.status === 'STOPPED') {
      this.status = this.halted ? 'HALTED' : 'FEEDING';
      this.finishing = false;
    }
  }

  public stop(): void {
    if (this.status === 'HALTED') this.status = 'STOPPED';
    if (this.status !== 'FEEDING') return;
    const flush = this.batchSize === 0;
    this.status = 'STOPPED';
    this.finishing = true;
    this.batchSize = this.spawned; // the FlexFeeder stops placing
    // A feed run with no intact gear to bring ends at once; a flush runs out on its own.
    if (this.unsorted.length === 0 && (!flush || this.carried.length === 0)) this.halt();
  }

  /** The next unsorted (intact) Batch gear, lead first, or undefined once the Batch is sorted. */
  public takeNext(): BeltGear | undefined {
    if (this.status !== 'HALTED' || this.awaitingPallet) return undefined;
    return this.unsorted.shift();
  }

  /** Called when a halted Batch is fully sorted: feed the next one, or finish the run. */
  public batchSorted(): void {
    if (this.status !== 'HALTED' || this.unsorted.length > 0 || this.awaitingPallet) return;
    if (this.exchanges.has('SCRAP')) return; // the belt never moves while the bin is away (D10)
    if (this.hopper.length > 0 || this.carried.length > 0) {
      this.startRun();
    } else {
      this.status = 'EMPTY';
    }
  }

  /** Advance the belt by `dtSeconds` of run time. */
  public step(dtSeconds: number): void {
    if (this.status !== 'FAULT') this.stepExchanges(dtSeconds);
    const moving = this.status === 'FEEDING' || (this.status === 'STOPPED' && this.finishing);
    if (!moving || dtSeconds <= 0) return;
    if (this.exchanges.has('SCRAP')) return; // the belt refuses to run while the bin is away (D10)
    let dist = BELT_SPEED_M_S * dtSeconds;
    if (this.unsorted.length > 0) {
      const toEdge = this.unsorted[0].y - PICK_ZONE_Y_RANGE[0];
      if (dist >= toEdge) {
        dist = Math.max(0, toEdge);
        this.halt();
      }
    }
    this.offsetM += dist;
    for (const g of this.carried) g.y -= dist;
    for (const g of this.unsorted) g.y -= dist;
    for (const g of this.carried.filter((c) => c.y < BELT_Y_RANGE[0])) {
      this.counts.SCRAP += 1; // the exit eye counted it: Rejected becomes Scrapped (D9)
      this.events.push({ kind: 'scrapped', gear: { ...g } });
    }
    this.carried = this.carried.filter((g) => g.y >= BELT_Y_RANGE[0]);
    // The Batch quota, or until an intact gear is on its way to the eye (D35).
    const feederMayPlace = this.spawned < this.batchSize || this.unsorted.length === 0;
    if (this.hopper.length === 0 && this.unsorted.length === 0 && this.carried.length === 0) {
      this.halt(); // the belt ran out (a flush, or a last run with no intact gear)
    }
    if (this.spawned > 0) this.nextGap -= dist;
    if (
      this.status === 'FEEDING' &&
      feederMayPlace &&
      this.hopper.length > 0 &&
      this.nextGap <= 0
    ) {
      this.spawnGear();
    }
  }

  public snapshot(): CellState {
    return {
      conveyor_status: this.status,
      feeder_remaining: this.hopper.length,
      belt_offset_m: this.offsetM,
      belt_gears: [...this.carried, ...this.unsorted].map((g) => ({ ...g })),
      stations: STATIONS.map((name) => ({
        name,
        exchange_state: this.exchangeState(name),
        count: this.counts[name],
      })),
    };
  }

  private exchangeState(name: StationName): ExchangeState {
    const t = this.exchanges.get(name);
    if (t === undefined) return 'HOME';
    const legs = EXCHANGE_LEGS[name === 'SCRAP' ? 'BIN' : 'PALLET'];
    if (t < legs.leave) return 'LEAVING';
    return t < legs.leave + legs.away ? 'AWAY' : 'RETURNING';
  }

  private stepExchanges(dt: number): void {
    for (const [name, t] of this.exchanges) {
      const legs = EXCHANGE_LEGS[name === 'SCRAP' ? 'BIN' : 'PALLET'];
      if (t + dt < legs.leave + legs.away + legs.back) {
        this.exchanges.set(name, t + dt);
        continue;
      }
      this.exchanges.delete(name); // HOME: ResetStation empties it
      this.counts[name] = 0;
      this.events.push({ kind: 'emptied', station: name });
      if (this.awaitingPallet === name) this.awaitingPallet = null;
    }
  }

  private halt(): void {
    this.halted = true;
    if (this.counts.SCRAP >= BIN_EXCHANGE_THRESHOLD && !this.exchanges.has('SCRAP')) {
      this.exchanges.set('SCRAP', 0); // at the belt stop, overlapping the sorting (D10)
    }
    if (this.finishing) {
      this.finishing = false; // the stopped run reached its end: stay STOPPED, or EMPTY after a flush
      const flushed =
        this.hopper.length === 0 && this.unsorted.length === 0 && this.carried.length === 0;
      if (flushed) this.status = 'EMPTY';
      return;
    }
    this.status = 'HALTED';
  }

  private startRun(): void {
    this.halted = false;
    this.status = 'FEEDING';
    this.spawned = 0;
    this.nextGap = 0;
    this.batchSize = Math.min(
      this.hopper.length,
      MIN_BATCH + Math.floor(this.rand() * (BELT_CAPACITY - MIN_BATCH + 1)),
    );
  }

  private spawnGear(): void {
    const spec = this.hopper.shift()!;
    const laneX = this.spawned % 2 === 0 ? LANE_A_X : LANE_B_X;
    const x = laneX + (this.rand() * 2 - 1) * LANE_HALF_WIDTH;
    this.idCounter += 1;
    (spec.intact ? this.unsorted : this.carried).push({
      id: `belt-${this.idCounter}`,
      color: spec.color,
      intact: spec.intact,
      x,
      y: FEEDER_EXIT_Y,
    });
    this.spawned += 1;
    this.nextGap = GAP_MIN_M + this.rand() * (GAP_MAX_M - GAP_MIN_M);
  }
}
