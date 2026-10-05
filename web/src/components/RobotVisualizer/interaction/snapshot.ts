import type * as THREE from 'three';
import type { GearColor, GearEntry } from '@contracts';
import type { WorkcellSnapshotView, TelemetryBufferLike } from '@/components/RobotVisualizer/types';
import type { GearwheelProceduralAssets } from '@/components/RobotVisualizer/assets/gear';
import type { ScrapBinProceduralAssets } from '@/components/RobotVisualizer/assets/scrapbin';
import {
  createProceduralGearwheel,
  setGearwheelColor,
  setGearwheelIntact,
} from '@/components/RobotVisualizer/assets/gear';
import { GRASP_RIDE_OFFSET_Z_M } from '@/components/RobotVisualizer/constants';

export interface SnapshotStore {
  gears: Map<string, { assets: GearwheelProceduralAssets; bucket: string }>;
}

export function createSnapshotStore(): SnapshotStore {
  return { gears: new Map() };
}

/** Where a Pallet is in its lane exchange, as far as the Gearwheels on it are concerned. */
export interface PalletView {
  /** Meters displaced toward -X along the lane. */
  offsetM: Record<GearColor, number>;
  /** AWAY or RETURNING: the next line took the Gearwheels, so none are drawn. */
  unloaded: Record<GearColor, boolean>;
}

export function readSnapshot(bufferRef?: TelemetryBufferLike): WorkcellSnapshotView {
  const ws = bufferRef?.current?.workcellState;
  if (!ws) return { spawned: [], inProgress: [], processed: [], activeId: null };
  return {
    spawned: Array.isArray(ws.spawned) ? ws.spawned : [],
    inProgress: Array.isArray(ws.inProgress) ? ws.inProgress : [],
    processed: Array.isArray(ws.processed) ? ws.processed : [],
    scrapped: Array.isArray(ws.scrapped) ? ws.scrapped : [],
    activeId: typeof ws.activeId === 'string' ? ws.activeId : null,
  };
}

function palletOf(
  entry: GearEntry,
  pallets: PalletView | undefined,
): { offsetM: number; unloaded: boolean } | null {
  if (!pallets) return null;
  const color = entry.color as GearColor;
  if (!(color in pallets.offsetM)) return null;
  return { offsetM: pallets.offsetM[color], unloaded: pallets.unloaded[color] };
}

export function reconcileSnapshotGears(
  store: SnapshotStore,
  snap: WorkcellSnapshotView,
  ctx: {
    robotGroup: THREE.Group;
    mountLink: THREE.Object3D | null;
    scrapBin?: ScrapBinProceduralAssets | null;
    pallets?: PalletView;
    onDirty: () => void;
  },
): void {
  const desired = new Map<string, { entry: GearEntry; bucket: string }>();
  for (const e of snap.spawned) desired.set(e.id, { entry: e, bucket: 'spawned' });
  for (const e of snap.inProgress) desired.set(e.id, { entry: e, bucket: 'in_progress' });
  // The bin is binary (green/red, ScrapBin below): a binned defective gear gets no mesh.
  for (const e of snap.processed) {
    if (e.intact !== false) desired.set(e.id, { entry: e, bucket: 'processed' });
  }

  // Remove meshes whose id left the snapshot.
  for (const [id, rec] of Array.from(store.gears)) {
    if (!desired.has(id)) {
      store.gears.delete(id);
      if (rec.assets.group.parent) rec.assets.group.parent.remove(rec.assets.group);
      rec.assets.dispose();
      ctx.onDirty();
    }
  }
  // Create meshes for new ids; reparent/position in-progress rides.
  for (const [id, d] of desired) {
    let rec = store.gears.get(id);
    if (!rec) {
      const assets = createProceduralGearwheel();
      store.gears.set(id, { assets, bucket: d.bucket });
      rec = store.gears.get(id)!;
      ctx.onDirty();
    }
    if (rec.bucket !== d.bucket) {
      rec.bucket = d.bucket;
      ctx.onDirty();
    }
    // Recolor-on-echo: grey until the authoritative entry carries color,
    // matched by gear id. Notch follows intact the same way and survives
    // every reconcile (recolor, routing, bucket moves never clear it).
    if (setGearwheelColor(rec.assets, d.entry.color)) {
      ctx.onDirty();
    }
    if (setGearwheelIntact(rec.assets, d.entry.intact)) {
      ctx.onDirty();
    }
    if (d.bucket === 'spawned' || d.bucket === 'processed') {
      if (rec.assets.group.parent !== ctx.robotGroup) {
        if (rec.assets.group.parent) rec.assets.group.parent.remove(rec.assets.group);
        ctx.robotGroup.add(rec.assets.group);
      }
      rec.assets.group.rotation.set(0, 0, 0);
      // A Gearwheel on a Pallet rides with it along the lane; unloaded Pallets carry none.
      const pallet = d.bucket === 'processed' ? palletOf(d.entry, ctx.pallets) : null;
      const x = d.entry.x - (pallet?.offsetM ?? 0);
      const visible = !pallet?.unloaded;
      if (
        rec.assets.group.position.x !== x ||
        rec.assets.group.position.y !== d.entry.y ||
        rec.assets.group.position.z !== d.entry.z ||
        rec.assets.group.visible !== visible
      ) {
        ctx.onDirty();
      }
      rec.assets.group.visible = visible;
      rec.assets.group.position.set(x, d.entry.y, d.entry.z);
    } else if (d.bucket === 'in_progress') {
      if (ctx.mountLink) {
        if (rec.assets.group.parent !== ctx.mountLink) {
          if (rec.assets.group.parent) rec.assets.group.parent.remove(rec.assets.group);
          ctx.mountLink.add(rec.assets.group);
        }
        rec.assets.group.position.set(0, 0, GRASP_RIDE_OFFSET_Z_M);
      } else {
        // No URDF flange yet (tests): keep mesh tracked but parked at
        // entry coords so count/position probes stay meaningful.
        if (rec.assets.group.parent !== ctx.robotGroup) {
          if (rec.assets.group.parent) rec.assets.group.parent.remove(rec.assets.group);
          ctx.robotGroup.add(rec.assets.group);
        }
        rec.assets.group.position.set(d.entry.x, d.entry.y, d.entry.z);
      }
    }
  }
  // ScrapBin binary state: non-empty iff a Gearwheel is Scrapped (Rejected ones still lie on the belt)
  // or, in Flow A, a defective one was booked straight to processed.
  // Defective gears render into bin pile verbatim (workcell owns coords).
  if (ctx.scrapBin) {
    const hasRejects =
      (snap.scrapped?.length ?? 0) > 0 || snap.processed.some((e) => e.intact === false);
    if (ctx.scrapBin.hasItems !== hasRejects) {
      ctx.scrapBin.setHasItems(hasRejects);
      ctx.onDirty();
    }
  }
}
