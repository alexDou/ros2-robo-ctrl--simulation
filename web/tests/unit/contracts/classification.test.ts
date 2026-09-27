import { describe, it, expect } from 'vitest';
describe('Unit 7.0: required color + intact on GearEntry (hand-sim-9kw2)', () => {
  it('spawn payload carries no classification; GearEntry requires color + intact, rejects RED', async () => {
    const contracts = await import('@contracts');
    expect(() =>
      contracts.parseSpawnObjectPayload({ x: 0.5, y: 0, z: 0, object_type: 'GEAR', color: 'WHITE' })
    ).toThrow();
    expect(() =>
      contracts.parseSpawnObjectPayload({ x: 0.5, y: 0, z: 0, object_type: 'GEAR', intact: true })
    ).toThrow();
    const spawn = contracts.parseSpawnObjectPayload({ x: 0.5, y: 0, z: 0, object_type: 'GEAR' });
    expect(spawn).toEqual({ x: 0.5, y: 0, z: 0, object_type: 'GEAR' });
    for (const color of ['WHITE', 'GREEN', 'BLUE'] as const) {
      for (const intact of [false, true]) {
        const g = contracts.parseGearEntry({ id: 'g0', x: 0.1, y: 0.1, z: 0, color, intact });
        expect(g.color).toBe(color);
        expect(g.intact).toBe(intact);
      }
    }
    expect(() =>
      contracts.parseGearEntry({ id: 'g0', x: 0.1, y: 0.1, z: 0, color: 'RED', intact: true })
    ).toThrow();
    expect(() => contracts.parseGearEntry({ id: 'g0', x: 0.1, y: 0.1, z: 0 })).toThrow();
    expect(contracts.WHITE_TOWER).toEqual([0.4, -0.3, 0.0]);
    expect(contracts.GREEN_TOWER).toEqual([0.55, -0.3, 0.0]);
    expect(contracts.BLUE_TOWER).toEqual([0.7, -0.3, 0.0]);
    expect(contracts.SCRAP_BIN).toEqual([0.4, 0.28, 0.0]);
    expect(contracts.TOWER_CAPACITY).toBe(10);
    expect(contracts.STACK_STEP_M).toBe(0.02);
  });
});
