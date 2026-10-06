import type { GearColor, GearEntry, StationStatus } from '@contracts';

export function towerCounts(processed: readonly GearEntry[]): Record<GearColor, number> {
  const counts: Record<GearColor, number> = { WHITE: 0, GREEN: 0, BLUE: 0 };
  for (const e of processed) {
    if (e.intact !== false && e.color in counts) counts[e.color]++;
  }
  return counts;
}

/** Display panel counts: exactly what cell_state.stations says (D34), zero before the first. */
export function panelCounts(stations: readonly StationStatus[] | undefined): {
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
