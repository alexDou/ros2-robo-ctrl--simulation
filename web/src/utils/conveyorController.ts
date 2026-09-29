import {
  BELT_X_RANGE,
  type GearColor,
  type PickAndPlaceTargetPayload,
  type SpawnObjectPayload,
} from '@contracts';

/** A gear standing in the PickZone with its client-assigned classification. */
export interface GearOnBelt {
  color: GearColor;
  intact: boolean;
  x: number;
  y: number;
}

/** Seams to the session (commands out) and the workcell snapshot (progress in). */
export interface ConveyorPorts {
  spawn: (payload: SpawnObjectPayload) => void;
  pickAndPlace: (payload: PickAndPlaceTargetPayload) => void;
  /** Resolves once the workcell snapshot lists the spawned gear. */
  waitForRegistered: () => Promise<void>;
  /** Resolves once the pick finished and the arm is IDLE again. */
  waitForSettled: () => Promise<void>;
}

/** Tracer bullet (Unit 8.0c): one known sound gear at the belt centre of the PickZone. */
export const TRACER_GEAR: GearOnBelt = {
  color: 'GREEN',
  intact: true,
  x: (BELT_X_RANGE[0] + BELT_X_RANGE[1]) / 2,
  y: 0.0,
};

/**
 * Per-gear dispatch (ADR 0005 §4): SPAWN_OBJECT registers the gear in the workcell, then a
 * PICK_AND_PLACE_TARGET at where the gear stands; the workcell routes the drop to its color tower.
 * Defective gears are registered only (the workcell scraps them without arm motion).
 */
export async function dispatchGear(ports: ConveyorPorts, gear: GearOnBelt): Promise<void> {
  ports.spawn({
    x: gear.x,
    y: gear.y,
    z: 0.0,
    object_type: 'GEAR',
    color: gear.color,
    intact: gear.intact,
  });
  if (!gear.intact) return;
  await ports.waitForRegistered();
  ports.pickAndPlace({ pick_x: gear.x, pick_y: gear.y, pick_z: 0.0 });
  await ports.waitForSettled();
}
