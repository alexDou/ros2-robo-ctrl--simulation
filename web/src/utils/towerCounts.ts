import type { GearColor, GearEntry } from '@contracts';

export function towerCounts(processed: readonly GearEntry[]): Record<GearColor, number> {
  const counts: Record<GearColor, number> = { WHITE: 0, GREEN: 0, BLUE: 0 };
  for (const e of processed) {
    if (e.intact !== false && e.color in counts) counts[e.color]++;
  }
  return counts;
}

/** ScrapBin count: Scrapped Gearwheels, plus Flow A defectives booked straight to `processed`. */
export function binCount(
  scrapped: readonly GearEntry[] | undefined,
  processed: readonly GearEntry[] | undefined,
): number {
  return (scrapped?.length ?? 0) + (processed ?? []).filter((e) => e.intact === false).length;
}
