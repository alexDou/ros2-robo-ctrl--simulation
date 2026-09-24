import type * as THREE from 'three';
import type { GearEntry } from '@contracts';
import type { WorkcellSnapshotView, TelemetryBufferLike } from '@/components/RobotVisualizer/types';
import type { GearwheelProceduralAssets } from '@/components/RobotVisualizer/assets/gear';
import type { TableProceduralAssets } from '@/components/RobotVisualizer/assets/table';
import type { ScrapBinProceduralAssets } from '@/components/RobotVisualizer/assets/scrapbin';
import { createProceduralGearwheel, setGearwheelColor } from '@/components/RobotVisualizer/assets/gear';
import { GRASP_RIDE_OFFSET_Z_M } from '@/components/RobotVisualizer/constants';

export interface SnapshotStore {
  gears: Map<string, { assets: GearwheelProceduralAssets; bucket: string }>;
  lockout: boolean;
}

export function createSnapshotStore(): SnapshotStore {
  return { gears: new Map(), lockout: false };
}

export function readSnapshot(bufferRef?: TelemetryBufferLike): WorkcellSnapshotView {
  const ws = bufferRef?.current?.workcellState;
  if (!ws) return { spawned: [], inProgress: [], processed: [], activeId: null };
  return {
    spawned: Array.isArray(ws.spawned) ? ws.spawned : [],
    inProgress: Array.isArray(ws.inProgress) ? ws.inProgress : [],
    processed: Array.isArray(ws.processed) ? ws.processed : [],
    activeId: typeof ws.activeId === 'string' ? ws.activeId : null,
  };
}

export function reconcileSnapshotGears(
  store: SnapshotStore,
  snap: WorkcellSnapshotView,
  ctx: {
    robotGroup: THREE.Group;
    mountLink: THREE.Object3D | null;
    tableAssets: TableProceduralAssets | null;
    scrapBin?: ScrapBinProceduralAssets | null;
    onDirty: () => void;
  },
): void {
  const desired = new Map<string, { entry: GearEntry; bucket: string }>();
  for (const e of snap.spawned) desired.set(e.id, { entry: e, bucket: 'spawned' });
  for (const e of snap.inProgress) desired.set(e.id, { entry: e, bucket: 'in_progress' });
  for (const e of snap.processed) desired.set(e.id, { entry: e, bucket: 'processed' });

  // Remove meshes whose id left the snapshot.
  for (const [id, rec] of Array.from(store.gears)) {
    if (!desired.has(id)) {
      if (rec.assets.group.parent) rec.assets.group.parent.remove(rec.assets.group);
      rec.assets.dispose();
      store.gears.delete(id);
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
    // matched by gear id.
    if (setGearwheelColor(rec.assets, d.entry.color)) {
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
  // Lockout derives from active buckets only: spawned/in_progress block
  // clicks, processed tower never does (matches pre-6.7 ClickLockout).
  const hasActive = snap.spawned.length > 0 || snap.inProgress.length > 0;
  store.lockout = hasActive;
  if (ctx.tableAssets && hasActive) {
    ctx.tableAssets.reticleMesh.visible = false;
  }
  // ScrapBin binary state: non-empty iff any processed entry is defective.
  // Defective gears render into bin pile verbatim (workcell owns coords).
  if (ctx.scrapBin) {
    const hasRejects = snap.processed.some((e) => e.intact === false);
    if (ctx.scrapBin.hasItems !== hasRejects) {
      ctx.scrapBin.setHasItems(hasRejects);
      ctx.onDirty();
    }
  }
}
