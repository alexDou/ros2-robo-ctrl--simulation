import type { ConveyorStatus } from '@contracts';

export type { ConveyorStatus };

/** Gearwheels a FlexFeeder holds after Fill; scales the hopper reservoir mesh. */
export const DECK_SIZE = 100;

export const canFill = (status: ConveyorStatus): boolean => status === 'EMPTY';
/** Process starts a loaded cell or resumes a stopped run. */
export const canProcess = (status: ConveyorStatus): boolean =>
  status === 'LOADED' || status === 'STOPPED';
/** Stop freezes a running belt; it has nothing to do before Process or after the run. */
export const canStop = (status: ConveyorStatus): boolean =>
  status === 'FEEDING' || status === 'HALTED';
