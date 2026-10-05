import type * as THREE from 'three';
import type { GearEntry } from '@contracts';
import type { WorkcellSnapshotView, TelemetryBufferLike } from '@/components/RobotVisualizer/types';
import type { GearwheelProceduralAssets } from '@/components/RobotVisualizer/assets/gear';
import type { ScrapBinProceduralAssets } from '@/components/RobotVisualizer/assets/scrapbin';
import {
  createProceduralGearwheel,
  setGearwheelColor,
  setGearwheelIntact,
} from '@/components/RobotVisualizer/assets/gear';
import { GRASP_RIDE_OFFSET_Z_M, TOWER_FADE_MS } from '@/components/RobotVisualizer/constants';

export interface SnapshotStore {
  gears: Map<string, { assets: GearwheelProceduralAssets; bucket: string }>;
  /** Tower gears whose id left the snapshot (tower auto-emptied), fading out. */
  fading: Map<string, { assets: GearwheelProceduralAssets; startMs: number }>;
}

export function createSnapshotStore(): SnapshotStore {
  return { gears: new Map(), fading: new Map() };
}

function setGearOpacity(assets: GearwheelProceduralAssets, opacity: number): void {
  assets.group.traverse((obj) => {
    const mat = (obj as THREE.Mesh).material as THREE.Material | undefined;
    if (!mat) return;
    mat.transparent = true;
    mat.opacity = opacity;
  });
}

function advanceFades(store: SnapshotStore, now: number, onDirty: () => void): void {
  for (const [id, f] of Array.from(store.fading)) {
    const t = (now - f.startMs) / TOWER_FADE_MS;
    if (t >= 1) {
      if (f.assets.group.parent) f.assets.group.parent.remove(f.assets.group);
      f.assets.dispose();
      store.fading.delete(id);
    } else {
      setGearOpacity(f.assets, 1 - Math.max(0, t));
    }
    onDirty();
  }
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

export function reconcileSnapshotGears(
  store: SnapshotStore,
  snap: WorkcellSnapshotView,
  ctx: {
    robotGroup: THREE.Group;
    mountLink: THREE.Object3D | null;
    scrapBin?: ScrapBinProceduralAssets | null;
    onDirty: () => void;
    now?: number;
  },
): void {
  const now = ctx.now ?? performance.now();
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
      if (rec.bucket === 'processed' && rec.assets.intact !== false) {
        // Tower reset: fade the stack out; a new stack may already be growing.
        store.fading.set(id, { assets: rec.assets, startMs: now });
      } else {
        if (rec.assets.group.parent) rec.assets.group.parent.remove(rec.assets.group);
        rec.assets.dispose();
      }
      ctx.onDirty();
    }
  }
  advanceFades(store, now, ctx.onDirty);
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
      rec.assets.group.position.set(d.entry.x, d.entry.y, d.entry.z);
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
