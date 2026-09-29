import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/preact';
import { useConveyor, type UseConveyorParams } from '@/hooks/useConveyor';
import { DECK_SIZE } from '@utils/conveyorController';

afterEach(() => {
  vi.useRealTimers();
});

function params(overrides: Partial<UseConveyorParams> = {}): UseConveyorParams {
  return {
    connected: true,
    robotState: 'IDLE',
    workcell: () => undefined,
    spawnObject: vi.fn(),
    pickAndPlace: vi.fn(),
    goHomePose: vi.fn(),
    armAtHome: () => true,
    waitUntil: () => new Promise<void>(() => undefined),
    report: vi.fn(),
    seed: 7,
    ...overrides,
  };
}

describe('Unit 8.2c: useConveyor (hand-sim-as72)', () => {
  it('Fill loads a full deck; a disconnect empties hopper and belt and reports the abort', async () => {
    vi.useFakeTimers();
    const base = params();
    const { result, rerender } = renderHook((p: UseConveyorParams) => useConveyor(p), {
      initialProps: base,
    });
    act(() => result.current.handleFill());
    expect(result.current.conveyorStatus).toBe('LOADED');
    expect(result.current.deck).toHaveLength(DECK_SIZE);

    act(() => result.current.handleProcess());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(result.current.conveyorStatus).toBe('FEEDING');

    await act(async () => {
      rerender({ ...base, connected: false });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.conveyorStatus).toBe('EMPTY');
    expect(result.current.deck).toHaveLength(0);
    expect(result.current.feederRef.current).toBeNull();
    // Aborting is reported, never silent.
    await vi.waitFor(() =>
      expect(base.report).toHaveBeenCalledWith('CONVEYOR_ABORTED', expect.any(String)),
    );
  });
});
