import { PALLET_CAPACITY, type GearColor, type GearEntry, type StationStatus } from '@contracts';

export function towerCounts(processed: readonly GearEntry[]): Record<GearColor, number> {
  const counts: Record<GearColor, number> = { WHITE: 0, GREEN: 0, BLUE: 0 };
  for (const e of processed) {
    if (e.intact !== false && e.color in counts) counts[e.color]++;
  }
  return counts;
}

/** Station counts: exactly what cell_state.stations says (D34), zero before the first. */
export function stationCounts(stations: readonly StationStatus[] | undefined): {
  binCount: number;
  palletCounts: Record<GearColor, number>;
} {
  const palletCounts: Record<GearColor, number> = { WHITE: 0, GREEN: 0, BLUE: 0 };
  let binCount = 0;
  for (const st of stations ?? []) {
    const count = Number(st.count); // the wire type also admits bigint and string
    if (st.name === 'SCRAP') binCount = count;
    else palletCounts[st.name] = count;
  }
  return { binCount, palletCounts };
}

/** One line of the counters overlay. */
export interface CounterLine {
  key: 'FEEDER' | 'BIN' | GearColor;
  text: string;
}

/**
 * The counters overlay (D25): FlexFeeder remaining, ScrapBin and Pallets n/10 from cell_state
 * (D34). Without a cell_state (Flow A) the Pallets count the processed Gearwheels instead.
 */
export function cellCounters(
  feederRemaining: number,
  stations: readonly StationStatus[] | undefined,
  processed: readonly GearEntry[],
): CounterLine[] {
  const { binCount, palletCounts } = stationCounts(stations);
  const pallets = stations ? palletCounts : towerCounts(processed);
  return [
    { key: 'FEEDER', text: `FEEDER: ${feederRemaining}` },
    { key: 'BIN', text: `BIN: ${binCount}` },
    ...(['WHITE', 'GREEN', 'BLUE'] as const).map((c) => ({
      key: c,
      text: `${c}: ${pallets[c]}/${PALLET_CAPACITY}`,
    })),
  ];
}
