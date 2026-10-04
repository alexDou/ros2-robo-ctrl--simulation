import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/preact';
import { useConveyor, type UseConveyorParams } from '@/hooks/useConveyor';
import { DECK_SIZE } from '@utils/conveyorController';
import type { ConveyorStatus } from '@contracts';

function params(overrides: Partial<UseConveyorParams> = {}): UseConveyorParams {
  return {
    connected: true,
    robotState: 'IDLE',
    cellStatus: null,
    cellProcess: vi.fn(),
    cellStop: vi.fn(),
    seed: 7,
    ...overrides,
  };
}

const render = (p: UseConveyorParams) =>
  renderHook((props: UseConveyorParams) => useConveyor(props), { initialProps: p });

describe('Unit 9.06: useConveyor sends intents (hand-sim-42d4)', () => {
  it('Fill loads the hopper locally; Process and Stop only send CELL_* intents', () => {
    const base = params();
    const { result } = render(base);
    act(() => result.current.handleFill());
    expect(result.current.conveyorStatus).toBe('LOADED');
    expect(result.current.deck).toHaveLength(DECK_SIZE);

    act(() => result.current.handleProcess());
    expect(base.cellProcess).toHaveBeenCalledTimes(1);
    // Status is owned by the cell: no optimistic local FEEDING.
    expect(result.current.conveyorStatus).toBe('LOADED');

    act(() => result.current.handleStop());
    expect(base.cellStop).toHaveBeenCalledTimes(1);
  });

  it('derives the status from cell_state once the cell is running', () => {
    const base = params();
    const { result, rerender } = render(base);
    act(() => result.current.handleFill());
    for (const status of ['FEEDING', 'HALTED', 'STOPPED', 'FAULT'] as ConveyorStatus[]) {
      rerender({ ...base, cellStatus: status });
      expect(result.current.conveyorStatus).toBe(status);
    }
    // Back to the cell's idle states: the local Fill state shows again.
    rerender({ ...base, cellStatus: 'EMPTY' });
    expect(result.current.conveyorStatus).toBe('LOADED');
  });

  it('a disconnect empties the hopper', () => {
    const base = params();
    const { result, rerender } = render(base);
    act(() => result.current.handleFill());
    rerender({ ...base, connected: false });
    expect(result.current.conveyorStatus).toBe('EMPTY');
    expect(result.current.deck).toHaveLength(0);
  });
});
