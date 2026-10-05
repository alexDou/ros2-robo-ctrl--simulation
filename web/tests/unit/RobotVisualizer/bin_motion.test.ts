import { describe, it, expect } from 'vitest';
import { binPose, createBinMotion } from '@/components/RobotVisualizer/interaction/binMotion';
import {
  BIN_LEAVE_MS,
  BIN_RETURN_MS,
  BIN_SLIDE_TRAVEL_M,
  BIN_TIP_ANGLE_RAD,
  BIN_TIP_MS,
  BIN_UNTIP_MS,
} from '@/components/RobotVisualizer/constants';
import type { StationStatus } from '@contracts';

const rest = { slide: 0, tip: 0 };
const bin = (state: StationStatus['exchange_state']): StationStatus[] => [
  { name: 'WHITE', exchange_state: 'HOME', count: 0 },
  { name: 'SCRAP', exchange_state: state, count: 20 },
];

describe('Unit 9.18: binPose', () => {
  it('HOME is upright under the belt exit', () => {
    expect(binPose('HOME', 9999, rest)).toEqual(rest);
  });

  it('LEAVING slides out without tipping and holds the end if the device is late', () => {
    expect(binPose('LEAVING', 0, rest)).toEqual(rest);
    const mid = binPose('LEAVING', BIN_LEAVE_MS / 2, rest);
    expect(mid.slide).toBeCloseTo(0.5, 5);
    expect(mid.tip).toBe(0);
    expect(binPose('LEAVING', BIN_LEAVE_MS * 3, rest).slide).toBe(1);
  });

  it('AWAY is fully out and tips over its nominal time', () => {
    expect(binPose('AWAY', 0, rest)).toEqual({ slide: 1, tip: 0 });
    expect(binPose('AWAY', BIN_TIP_MS / 2, rest).tip).toBeCloseTo(0.5, 5);
    expect(binPose('AWAY', BIN_TIP_MS * 3, rest)).toEqual({ slide: 1, tip: 1 });
  });

  it('RETURNING untips while sliding back to HOME', () => {
    expect(binPose('RETURNING', 0, rest)).toEqual({ slide: 1, tip: 1 });
    expect(binPose('RETURNING', BIN_UNTIP_MS * 2, rest).tip).toBe(0);
    expect(binPose('RETURNING', BIN_RETURN_MS / 2, rest).slide).toBeCloseTo(0.5, 5);
    expect(binPose('RETURNING', BIN_RETURN_MS * 3, rest)).toEqual(rest);
  });

  it('FAULT holds the last pose', () => {
    const held = { slide: 0.4, tip: 0 };
    expect(binPose('FAULT', 5000, held)).toEqual(held);
  });
});

describe('Unit 9.18: bin position follows exchange state', () => {
  it('rests without a SCRAP station (older snapshots, mock gateway)', () => {
    const motion = createBinMotion();
    expect(motion.update(undefined, 0)).toEqual({ offsetM: 0, tipRad: 0 });
    expect(motion.update([{ name: 'WHITE', exchange_state: 'AWAY', count: 10 }], 10)).toEqual({
      offsetM: 0,
      tipRad: 0,
    });
  });

  it('slides +X, tips, and comes back; Pallet stations do not move it', () => {
    const motion = createBinMotion();
    motion.update(bin('HOME'), 0);
    motion.update(bin('LEAVING'), 1000);
    const mid = motion.update(bin('LEAVING'), 1000 + BIN_LEAVE_MS / 2);
    expect(mid.offsetM).toBeGreaterThan(0);
    expect(mid.offsetM).toBeLessThan(BIN_SLIDE_TRAVEL_M);
    expect(mid.tipRad).toBe(0);

    motion.update(bin('AWAY'), 5000);
    const tipped = motion.update(bin('AWAY'), 5000 + BIN_TIP_MS);
    expect(tipped).toEqual({ offsetM: BIN_SLIDE_TRAVEL_M, tipRad: BIN_TIP_ANGLE_RAD });

    motion.update(bin('RETURNING'), 8000);
    expect(motion.update(bin('RETURNING'), 8000 + BIN_RETURN_MS)).toEqual({
      offsetM: 0,
      tipRad: 0,
    });
  });
});
