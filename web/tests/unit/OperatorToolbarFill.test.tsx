import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { OperatorToolbar } from '@components/OperatorToolbar';
import { DECK_SIZE, type ConveyorStatus } from '@utils/conveyorController';

function renderToolbar(
  status: ConveyorStatus,
  onFill = vi.fn(),
  onProcess = vi.fn(),
  hopperCount = DECK_SIZE,
) {
  render(
    <OperatorToolbar
      robotState="IDLE"
      connectionState="CONNECTED"
      hasActiveGear={false}
      conveyorStatus={status}
      hopperCount={hopperCount}
      onExecutePose={vi.fn()}
      onConnect={vi.fn()}
      onDisconnect={vi.fn()}
      onResetFault={vi.fn()}
      onClearWorkspace={vi.fn()}
      onFill={onFill}
      onProcess={onProcess}
    />,
  );
  return { onFill, onProcess };
}

describe('Unit 8.2a: Fill / Process gating by ConveyorStatus (hand-sim-n5lx)', () => {
  it('EMPTY: Fill enabled, Process disabled', () => {
    const { onFill } = renderToolbar('EMPTY');
    const fill = screen.getByTestId('fill-button') as HTMLButtonElement;
    expect(fill.disabled).toBe(false);
    expect((screen.getByTestId('process-button') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(fill);
    expect(onFill).toHaveBeenCalledOnce();
  });

  it('LOADED but hopper not full: Process disabled (it runs the whole deck)', () => {
    renderToolbar('LOADED', vi.fn(), vi.fn(), DECK_SIZE - 1);
    expect((screen.getByTestId('process-button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('LOADED: Fill disabled, Process enabled', () => {
    renderToolbar('LOADED');
    expect((screen.getByTestId('fill-button') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('process-button') as HTMLButtonElement).disabled).toBe(false);
  });

  it.each(['FEEDING', 'HALTED', 'STOPPED'] as const)('%s: both disabled', (status) => {
    renderToolbar(status);
    expect((screen.getByTestId('fill-button') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('process-button') as HTMLButtonElement).disabled).toBe(true);
  });
});
