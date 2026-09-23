import * as THREE from 'three';
import {
  getTableCoordinates,
  isValidSpawnTarget,
  buildSpawnPayload,
  type PickingContext,
} from '@/components/RobotVisualizer/interaction/picking';
import type { TableProceduralAssets } from '@/components/RobotVisualizer/assets/table';
import type { SpawnObjectPayload } from '@contracts';

export interface PointerHandlersDeps {
  canvas: HTMLCanvasElement;
  camera: THREE.PerspectiveCamera;
  robotGroup: THREE.Group;
  getTableAssets: () => TableProceduralAssets | null;
  isDisposed: () => boolean;
  isIdle: () => boolean;
  isClickLocked: () => boolean;
  onSpawn: (payload: SpawnObjectPayload) => void;
  onDirty: () => void;
}

export interface PointerHandlers {
  onPointerDown: (event: PointerEvent) => void;
  onPointerMove: (event: PointerEvent) => void;
  onPointerLeave: () => void;
  onCanvasClick: (event: MouseEvent) => void;
  handleMove: (x: number, y: number) => void;
  handleLeave: () => void;
  handleClick: (x: number, y: number) => boolean;
  attach: () => void;
  detach: () => void;
}

/** Pointer/raycast handlers extracted from Visualizer.tsx (move-only). */
export function createPointerHandlers(deps: PointerHandlersDeps): PointerHandlers {
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  let pointerDownPos: { x: number; y: number } | null = null;

  const pickingCtx = (): PickingContext => ({
    canvas: deps.canvas,
    camera: deps.camera,
    robotGroup: deps.robotGroup,
    tableAssets: deps.getTableAssets(),
    raycaster,
    pointerNdc,
  });

  const handlePointerMoveCoords = (x: number, y: number) => {
    if (deps.isDisposed()) return;
    const table = deps.getTableAssets();
    if (!table) return;
    if (isValidSpawnTarget(table, x, y) && deps.isIdle() && !deps.isClickLocked()) {
      table.reticleMesh.position.set(x, y, 0.006);
      if (!table.reticleMesh.visible) {
        table.reticleMesh.visible = true;
      }
      deps.onDirty();
    } else if (table.reticleMesh.visible) {
      table.reticleMesh.visible = false;
      deps.onDirty();
    }
  };

  const handlePointerLeaveAction = () => {
    const table = deps.getTableAssets();
    if (table && table.reticleMesh.visible) {
      table.reticleMesh.visible = false;
      deps.onDirty();
    }
  };

  const handleClickCoords = (x: number, y: number) => {
    if (deps.isDisposed()) return false;
    const table = deps.getTableAssets();
    if (!table) return false;
    if (deps.isClickLocked() || !deps.isIdle()) return false;
    if (isValidSpawnTarget(table, x, y)) {
      deps.onSpawn(buildSpawnPayload(x, y));
      table.reticleMesh.visible = false;
      deps.onDirty();
      return true;
    }
    return false;
  };

  const onPointerDown = (event: PointerEvent) => {
    pointerDownPos = { x: event.clientX, y: event.clientY };
  };

  const onPointerMove = (event: PointerEvent) => {
    if (deps.isDisposed() || !deps.getTableAssets()) return;
    const coords = getTableCoordinates(pickingCtx(), event.clientX, event.clientY);
    if (coords) {
      handlePointerMoveCoords(coords.x, coords.y);
    } else {
      handlePointerLeaveAction();
    }
  };

  const onPointerLeave = () => {
    handlePointerLeaveAction();
  };

  const onCanvasClick = (event: MouseEvent) => {
    if (deps.isDisposed() || !deps.getTableAssets()) return;
    if (pointerDownPos) {
      const dx = event.clientX - pointerDownPos.x;
      const dy = event.clientY - pointerDownPos.y;
      if (dx * dx + dy * dy > 16) {
        return;
      }
    }
    const coords = getTableCoordinates(pickingCtx(), event.clientX, event.clientY);
    if (coords) {
      handleClickCoords(coords.x, coords.y);
    }
  };

  const attach = () => {
    deps.canvas.addEventListener('pointerdown', onPointerDown);
    deps.canvas.addEventListener('pointermove', onPointerMove);
    deps.canvas.addEventListener('pointerleave', onPointerLeave);
    deps.canvas.addEventListener('click', onCanvasClick);
  };

  const detach = () => {
    deps.canvas.removeEventListener('pointerdown', onPointerDown);
    deps.canvas.removeEventListener('pointermove', onPointerMove);
    deps.canvas.removeEventListener('pointerleave', onPointerLeave);
    deps.canvas.removeEventListener('click', onCanvasClick);
  };

  return {
    onPointerDown,
    onPointerMove,
    onPointerLeave,
    onCanvasClick,
    handleMove: handlePointerMoveCoords,
    handleLeave: handlePointerLeaveAction,
    handleClick: handleClickCoords,
    attach,
    detach,
  };
}
