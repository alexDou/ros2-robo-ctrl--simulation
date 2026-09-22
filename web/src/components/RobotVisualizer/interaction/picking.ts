import type * as THREE from 'three';
import type { SpawnObjectPayload } from '@contracts';
import type { TableProceduralAssets } from '@/components/RobotVisualizer/assets/table';
import {
  REACHABILITY_MIN_RADIUS,
  REACHABILITY_MAX_RADIUS,
} from '@/components/RobotVisualizer/constants';

export interface PickingContext {
  canvas: HTMLCanvasElement;
  camera: THREE.PerspectiveCamera;
  robotGroup: THREE.Group;
  tableAssets: TableProceduralAssets | null;
  raycaster: THREE.Raycaster;
  pointerNdc: THREE.Vector2;
}

export function getTableCoordinates(
  ctx: PickingContext,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  if (!ctx.tableAssets) return null;
  const rect = ctx.canvas.getBoundingClientRect();
  const rectWidth = rect.width || ctx.canvas.width || 800;
  const rectHeight = rect.height || ctx.canvas.height || 600;
  ctx.pointerNdc.x = ((clientX - rect.left) / rectWidth) * 2 - 1;
  ctx.pointerNdc.y = -((clientY - rect.top) / rectHeight) * 2 + 1;

  ctx.camera.updateMatrixWorld();
  ctx.tableAssets.tableMesh.updateMatrixWorld(true);
  ctx.tableAssets.matMesh.updateMatrixWorld(true);

  ctx.raycaster.setFromCamera(ctx.pointerNdc, ctx.camera);
  const intersects = ctx.raycaster.intersectObjects(
    [ctx.tableAssets.matMesh, ctx.tableAssets.tableMesh],
    false,
  );
  if (intersects.length === 0) return null;

  const localPoint = ctx.robotGroup.worldToLocal(intersects[0].point);
  if (Math.abs(localPoint.z) > 0.05) {
    return null;
  }
  return { x: localPoint.x, y: localPoint.y };
}

export function isReachable(x: number, y: number): boolean {
  const r = Math.sqrt(x * x + y * y);
  return r >= REACHABILITY_MIN_RADIUS && r <= REACHABILITY_MAX_RADIUS;
}

export function isInsideTable(table: TableProceduralAssets, x: number, y: number): boolean {
  return (
    x >= table.bounds.minX &&
    x <= table.bounds.maxX &&
    y >= table.bounds.minY &&
    y <= table.bounds.maxY
  );
}

export function isInsideMat(table: TableProceduralAssets, x: number, y: number): boolean {
  return (
    x >= table.matBounds.minX &&
    x <= table.matBounds.maxX &&
    y >= table.matBounds.minY &&
    y <= table.matBounds.maxY
  );
}

export function isValidSpawnTarget(table: TableProceduralAssets, x: number, y: number): boolean {
  return isReachable(x, y) && isInsideTable(table, x, y) && isInsideMat(table, x, y);
}

export function buildSpawnPayload(x: number, y: number): SpawnObjectPayload {
  // Workcell-authority: click sends ONLY SPAWN_OBJECT. No local mesh;
  // table gear appears on snapshot echo. Edge auto-dispatches PnP.
  return { x, y, z: 0.0, object_type: 'GEAR' };
}
