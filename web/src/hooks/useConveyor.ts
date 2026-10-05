import type { ConveyorStatus } from '@contracts';

export interface UseConveyorParams {
  /** False on disconnect: the cell's last report is stale. */
  connected: boolean;
  /** Flow status reported by the cell (`cell_state`); null until the first report. */
  cellStatus: ConveyorStatus | null;
  /** Gearwheels left in the FlexFeeder, from `cell_state`. */
  feederRemaining: number;
  /** CELL_FILL / CELL_PROCESS / CELL_STOP intents to the gateway. */
  cellFill: () => void;
  cellProcess: () => void;
  cellStop: () => void;
}

/**
 * TeleopClient side of the conveyor cell (ADR 0006): Fill, Process and Stop are intents; the flow
 * status and the FlexFeeder count only ever come from `cell_state`, never from local state.
 */
export function useConveyor({
  connected,
  cellStatus,
  feederRemaining,
  cellFill,
  cellProcess,
  cellStop,
}: UseConveyorParams) {
  const reported = connected && cellStatus !== null;
  return {
    conveyorStatus: reported ? cellStatus : ('EMPTY' as ConveyorStatus),
    hopperCount: reported ? feederRemaining : 0,
    handleFill: cellFill,
    handleProcess: cellProcess,
    handleStop: cellStop,
  };
}
