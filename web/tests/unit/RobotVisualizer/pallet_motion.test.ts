import { describe, it, expect } from 'vitest';
import {
  createPalletMotion,
  palletProgress,
} from '@/components/RobotVisualizer/interaction/palletMotion';
import {
  PALLET_AWAY_MS,
  PALLET_LANE_TRAVEL_M,
  PALLET_LEAVE_MS,
  PALLET_RETURN_MS,
} from '@/components/RobotVisualizer/constants';
import type { StationStatus } from '@contracts';

const stations = (white: StationStatus['exchange_state'], count = 10): StationStatus[] => [
  { name: 'WHITE', exchange_state: white, count },
  { name: 'GREEN', exchange_state: 'HOME', count: 0 },
  { name: 'BLUE', exchange_state: 'HOME', count: 0 },
];

describe('Unit 9.16: palletProgress', () => {
  it('HOME is 0 and AWAY is 1', () => {
    expect(palletProgress('HOME', 5000, 0)).toBe(0);
    expect(palletProgress('AWAY', 0, 0)).toBe(1);
  });

  it('LEAVING runs 0 -> 1 over the nominal leave time and holds at 1 if the device is late', () => {
    expect(palletProgress('LEAVING', 0, 0)).toBe(0);
    expect(palletProgress('LEAVING', PALLET_LEAVE_MS / 2, 0)).toBeCloseTo(0.5, 5);
    expect(palletProgress('LEAVING', PALLET_LEAVE_MS * 3, 0)).toBe(1);
  });

  it('RETURNING runs 1 -> 0 over the nominal return time', () => {
    expect(palletProgress('RETURNING', 0, 0)).toBe(1);
    expect(palletProgress('RETURNING', PALLET_RETURN_MS / 2, 0)).toBeCloseTo(0.5, 5);
    expect(palletProgress('RETURNING', PALLET_RETURN_MS * 3, 0)).toBe(0);
  });

  it('nominal legs add up to the 6 s PalletExchange', () => {
    expect(PALLET_LEAVE_MS + PALLET_AWAY_MS + PALLET_RETURN_MS).toBe(6000);
  });
});

describe('Unit 9.16: pallet position follows exchange state', () => {
  it('rests at 0 without stations (older snapshots, mock gateway)', () => {
    const motion = createPalletMotion();
    expect(motion.update(undefined, 0)).toEqual({ WHITE: 0, GREEN: 0, BLUE: 0 });
  });

  it('slides one lane off-scene and back, the others stay put', () => {
    const motion = createPalletMotion();
    motion.update(stations('HOME'), 0);

    motion.update(stations('LEAVING'), 1000);
    const mid = motion.update(stations('LEAVING'), 1000 + PALLET_LEAVE_MS / 2);
    expect(mid.WHITE).toBeGreaterThan(0);
    expect(mid.WHITE).toBeLessThan(PALLET_LANE_TRAVEL_M);
    expect(mid.GREEN).toBe(0);
    expect(mid.BLUE).toBe(0);

    expect(motion.update(stations('AWAY'), 4000).WHITE).toBe(PALLET_LANE_TRAVEL_M);

    motion.update(stations('RETURNING'), 6000);
    expect(motion.update(stations('RETURNING'), 6000 + PALLET_RETURN_MS).WHITE).toBe(0);
    expect(motion.update(stations('HOME', 0), 9000).WHITE).toBe(0);
  });

  it('is not restarted by repeated reports of the same state', () => {
    const motion = createPalletMotion();
    motion.update(stations('LEAVING'), 0);
    const a = motion.update(stations('LEAVING'), 500).WHITE;
    motion.update(stations('LEAVING'), 500);
    const b = motion.update(stations('LEAVING'), 600).WHITE;
    expect(b).toBeGreaterThan(a);
  });

  it('FAULT freezes the pallet where it stopped', () => {
    const motion = createPalletMotion();
    motion.update(stations('LEAVING'), 0);
    const stopped = motion.update(stations('LEAVING'), PALLET_LEAVE_MS / 2).WHITE;
    expect(motion.update(stations('FAULT'), PALLET_LEAVE_MS).WHITE).toBe(stopped);
    expect(motion.update(stations('FAULT'), PALLET_LEAVE_MS * 5).WHITE).toBe(stopped);
  });

  it('reports which pallets are unloaded (AWAY and RETURNING)', () => {
    const motion = createPalletMotion();
    motion.update(stations('LEAVING'), 0);
    expect(motion.isUnloaded('WHITE')).toBe(false);
    motion.update(stations('AWAY'), 100);
    expect(motion.isUnloaded('WHITE')).toBe(true);
    motion.update(stations('RETURNING'), 200);
    expect(motion.isUnloaded('WHITE')).toBe(true);
    motion.update(stations('HOME'), 300);
    expect(motion.isUnloaded('WHITE')).toBe(false);
  });
});
