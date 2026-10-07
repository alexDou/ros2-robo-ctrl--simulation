import { describe, it, expect } from 'vitest';
import { pocketCoords } from '@/utils/pallet';
import {
  GREEN_TOWER,
  PALLET_CAPACITY,
  PALLET_POCKET_DEPTH_M,
  PALLET_POCKET_PITCH_M,
  PALLET_TRAY_HEIGHT_M,
  WHITE_TOWER,
} from '@contracts';

describe('pocketCoords (D38 nest tray, mirrors workcell_manager.pallet)', () => {
  it('lays the 10 pockets on the pitch grid, centred on the station, at the pocket floor', () => {
    const pockets = Array.from({ length: PALLET_CAPACITY }, (_, k) => pocketCoords(WHITE_TOWER, k));
    expect(new Set(pockets.map(([x, y]) => `${x.toFixed(6)},${y.toFixed(6)}`)).size).toBe(10);
    for (const [, , z] of pockets) {
      expect(z).toBeCloseTo(WHITE_TOWER[2] + PALLET_TRAY_HEIGHT_M - PALLET_POCKET_DEPTH_M, 9);
    }
    const mean = (i: 0 | 1) => pockets.reduce((s, p) => s + p[i], 0) / pockets.length;
    expect(mean(0)).toBeCloseTo(WHITE_TOWER[0], 9);
    expect(mean(1)).toBeCloseTo(WHITE_TOWER[1], 9);
  });

  it('fills row by row from the arm side, -Y first', () => {
    const [x0, y0] = pocketCoords(GREEN_TOWER, 0);
    const [x1, y1] = pocketCoords(GREEN_TOWER, 1);
    const [x2] = pocketCoords(GREEN_TOWER, 2);
    expect(x0).toBeCloseTo(GREEN_TOWER[0] + 2 * PALLET_POCKET_PITCH_M, 9);
    expect(x1).toBeCloseTo(x0, 9);
    expect(y1 - y0).toBeCloseTo(PALLET_POCKET_PITCH_M, 9);
    expect(x2).toBeCloseTo(x0 - PALLET_POCKET_PITCH_M, 9);
  });

  it('rejects a pocket index outside the tray', () => {
    expect(() => pocketCoords(WHITE_TOWER, PALLET_CAPACITY)).toThrow();
    expect(() => pocketCoords(WHITE_TOWER, -1)).toThrow();
  });
});
