import { describe, it, expect } from 'vitest';
import { MockCell, type CellEvent } from '../e2e/support/mock_cell';
import { PICK_ZONE_Y_RANGE } from '../../domain/contracts';

const DT = 0.05;
/** A deck whose first two gears are defective, so one leads the first intact by a full PickZone-to-exit stretch. */
const FIRST_RUN_SCRAP_SEED = 163;

/** Step until the belt halts at the PickZone edge (or the cell runs empty); returns the events. */
function runToHalt(cell: MockCell): CellEvent[] {
  const events: CellEvent[] = [];
  for (let i = 0; i < 10_000; i++) {
    cell.step(DT);
    events.push(...cell.drainEvents());
    const status = cell.getStatus();
    if (status === 'HALTED' || status === 'EMPTY') return events;
  }
  throw new Error('the belt never halted');
}

function scraps(events: CellEvent[]): number {
  return events.filter((e) => e.kind === 'scrapped').length;
}

function loaded(seed: number): MockCell {
  const cell = new MockCell();
  cell.setSeed(seed);
  cell.fill();
  cell.process();
  return cell;
}

describe('MockCell (D35: defectives ride past the PickZone eye)', () => {
  it('halts every run on an intact gear at the PickZone edge and only hands out intact gears', () => {
    const cell = loaded(7);
    let scrapped = 0;
    let sorted = 0;
    while (cell.getStatus() !== 'EMPTY') {
      scrapped += scraps(runToHalt(cell));
      if (cell.getStatus() === 'EMPTY') break;
      const lead = cell
        .snapshot()
        .belt_gears.reduce<number | null>(
          (min, g) => (g.intact && (min === null || g.y < min) ? g.y : min),
          null,
        );
      if (lead !== null) expect(lead).toBeCloseTo(PICK_ZONE_Y_RANGE[0], 6);
      for (let gear = cell.takeNext(); gear; gear = cell.takeNext()) {
        expect(gear.intact).toBe(true);
        cell.commitDrop(gear.color);
        sorted += 1;
        for (let t = 0; t < 200; t++) cell.step(DT); // let any PalletExchange come HOME
        scrapped += scraps(cell.drainEvents());
      }
      cell.batchSorted();
    }
    expect(sorted).toBe(90);
    expect(scrapped).toBe(10);
  });

  it('drops a defective ahead of the lead intact gear into the bin on the first run', () => {
    const cell = loaded(FIRST_RUN_SCRAP_SEED);
    const events = runToHalt(cell);
    expect(cell.getStatus()).toBe('HALTED');
    expect(scraps(events)).toBeGreaterThan(0);
    expect(cell.snapshot().stations?.find((s) => s.name === 'SCRAP')?.count).toBe(scraps(events));
  });

  it('Stop with no intact gear on the belt ends the feed run at once', () => {
    const cell = loaded(FIRST_RUN_SCRAP_SEED);
    cell.step(DT);
    expect(cell.snapshot().belt_gears?.map((g) => g.intact)).toEqual([false]); // the seed's premise
    cell.stop();
    expect(cell.getStatus()).toBe('STOPPED');
    const before = cell.snapshot().belt_offset_m;
    cell.step(1);
    expect(cell.snapshot().belt_offset_m).toBe(before);
  });

  it('the belt never moves while the bin is away (D10), through two decks', () => {
    const cell = new MockCell();
    cell.setSeed(7);
    const binAway = () =>
      cell.snapshot().stations?.find((st) => st.name === 'SCRAP')?.exchange_state !== 'HOME';
    let sawAway = false;
    for (let deck = 0; deck < 2; deck++) {
      cell.fill();
      cell.process();
      while (cell.getStatus() !== 'EMPTY') {
        const away = binAway();
        const before = cell.snapshot().belt_offset_m;
        cell.step(DT);
        if (away) expect(cell.snapshot().belt_offset_m).toBe(before);
        sawAway ||= away;
        for (let gear = cell.takeNext(); gear; gear = cell.takeNext()) cell.commitDrop(gear.color);
        cell.batchSorted();
      }
    }
    expect(sawAway).toBe(true);
  });
});
