import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/preact';
import { useConveyor, type UseConveyorParams } from '@/hooks/useConveyor';
import type { ConveyorStatus } from '@contracts';

function params(overrides: Partial<UseConveyorParams> = {}): UseConveyorParams {
  return {
    connected: true,
    cellStatus: null,
    feederRemaining: 0,
    cellFill: vi.fn(),
    cellProcess: vi.fn(),
    cellStop: vi.fn(),
    ...overrides,
  };
}

const render = (p: UseConveyorParams) =>
  renderHook((props: UseConveyorParams) => useConveyor(props), { initialProps: p });

describe('Unit 9.07: useConveyor sends intents only (hand-sim-w824)', () => {
  it('Fill, Process and Stop only send CELL_* intents; nothing changes locally', () => {
    const base = params();
    const { result } = render(base);
    act(() => result.current.handleFill());
    act(() => result.current.handleProcess());
    act(() => result.current.handleStop());

    expect(base.cellFill).toHaveBeenCalledTimes(1);
    expect(base.cellProcess).toHaveBeenCalledTimes(1);
    expect(base.cellStop).toHaveBeenCalledTimes(1);
    // No optimistic LOADED: the cell reports it.
    expect(result.current.conveyorStatus).toBe('EMPTY');
    expect(result.current.hopperCount).toBe(0);
  });

  it('shows the status and FlexFeeder count the cell reports', () => {
    const base = params();
    const { result, rerender } = render(base);
    rerender({ ...base, cellStatus: 'LOADED', feederRemaining: 100 });
    expect(result.current.conveyorStatus).toBe('LOADED');
    expect(result.current.hopperCount).toBe(100);

    for (const status of ['FEEDING', 'HALTED', 'STOPPED', 'FAULT'] as ConveyorStatus[]) {
      rerender({ ...base, cellStatus: status, feederRemaining: 87 });
      expect(result.current.conveyorStatus).toBe(status);
      expect(result.current.hopperCount).toBe(87);
    }
  });

  it('a disconnect drops the stale report back to EMPTY / 0', () => {
    const base = params({ cellStatus: 'LOADED', feederRemaining: 100 });
    const { result, rerender } = render(base);
    rerender({ ...base, connected: false });
    expect(result.current.conveyorStatus).toBe('EMPTY');
    expect(result.current.hopperCount).toBe(0);
  });
});
