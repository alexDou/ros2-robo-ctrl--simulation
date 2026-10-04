import { useCallback, useEffect, useState } from 'preact/hooks';
import type { ConveyorStatus } from '@contracts';
import { buildDeck, type GearSpec } from '@utils/conveyorController';

export interface UseConveyorParams {
  /** False on disconnect: the locally filled hopper is dropped. */
  connected: boolean;
  robotState: string | null;
  /** Flow status reported by the cell (`cell_state`); null until the first report. */
  cellStatus: ConveyorStatus | null;
  /** CELL_PROCESS / CELL_STOP intents to the gateway. */
  cellProcess: () => void;
  cellStop: () => void;
  /** Deterministic deck randomness (tests, E2E); defaults to the clock. */
  seed?: number;
}

/** The cell reports these once it runs; EMPTY and LOADED stay a local Fill concern until CELL_FILL. */
const CELL_OWNED: readonly ConveyorStatus[] = [
  'FEEDING',
  'HALTED',
  'STOPPED',
  'FAULT',
  'RESETTING',
];

/**
 * TeleopClient side of the conveyor cell (ADR 0006): Process and Stop are intents, the flow status
 * comes from `cell_state`. Fill still builds the deck locally until its own ticket moves it to the cell.
 */
export function useConveyor({
  connected,
  robotState,
  cellStatus,
  cellProcess,
  cellStop,
  seed,
}: UseConveyorParams) {
  const [localStatus, setLocalStatus] = useState<ConveyorStatus>('EMPTY');
  const [deck, setDeck] = useState<GearSpec[]>([]);

  useEffect(() => {
    if (connected && robotState !== 'FAULT') return;
    setDeck([]);
    setLocalStatus('EMPTY');
  }, [connected, robotState]);

  const handleFill = useCallback(() => {
    setDeck(buildDeck(seed));
    setLocalStatus('LOADED');
  }, [seed]);

  const conveyorStatus = cellStatus && CELL_OWNED.includes(cellStatus) ? cellStatus : localStatus;

  return {
    conveyorStatus,
    deck,
    handleFill,
    handleProcess: cellProcess,
    handleStop: cellStop,
  };
}
