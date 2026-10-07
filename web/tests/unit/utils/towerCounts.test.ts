import { describe, it, expect } from 'vitest';
import { cellCounters, towerCounts } from '@/utils/towerCounts';
import type { GearEntry, StationStatus } from '@contracts';

const e = (color: GearEntry['color'], intact: boolean): GearEntry => ({
  id: Math.random().toString(),
  x: 0,
  y: 0,
  z: 0,
  color,
  intact,
  origin_x: 0,
  origin_y: 0,
  origin_z: 0,
});

describe('towerCounts', () => {
  it('counts intact gears per color and ignores scrap', () => {
    expect(
      towerCounts([e('WHITE', true), e('WHITE', true), e('GREEN', true), e('BLUE', false)]),
    ).toEqual({ WHITE: 2, GREEN: 1, BLUE: 0 });
  });
  it('is zero for an empty snapshot', () => {
    expect(towerCounts([])).toEqual({ WHITE: 0, GREEN: 0, BLUE: 0 });
  });
});

describe('cellCounters', () => {
  const station = (name: StationStatus['name'], count: number): StationStatus => ({
    name,
    exchange_state: 'HOME',
    count,
  });

  it('reads FEEDER, BIN and Pallets n/10, the counts straight from cell_state (D34)', () => {
    const stations = [
      station('WHITE', 3),
      station('GREEN', 0),
      station('BLUE', 9),
      station('SCRAP', 21),
    ];
    // processed still holds the Pallet the workcell has not cleared yet: cell_state wins
    expect(cellCounters(42, stations, [e('GREEN', true), e('GREEN', true)])).toEqual([
      { key: 'FEEDER', text: 'FEEDER: 42' },
      { key: 'BIN', text: 'BIN: 21' },
      { key: 'WHITE', text: 'WHITE: 3/10' },
      { key: 'GREEN', text: 'GREEN: 0/10' },
      { key: 'BLUE', text: 'BLUE: 9/10' },
    ]);
  });

  it('falls back to the processed Gearwheels without a cell_state (Flow A)', () => {
    expect(cellCounters(0, undefined, [e('WHITE', true), e('BLUE', false)])).toEqual([
      { key: 'FEEDER', text: 'FEEDER: 0' },
      { key: 'BIN', text: 'BIN: 0' },
      { key: 'WHITE', text: 'WHITE: 1/10' },
      { key: 'GREEN', text: 'GREEN: 0/10' },
      { key: 'BLUE', text: 'BLUE: 0/10' },
    ]);
  });
});
