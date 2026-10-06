import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { OperatorToolbar } from '@components/OperatorToolbar';
import type { ConveyorStatus } from '@utils/conveyorGating';

function renderToolbar(
  status: ConveyorStatus,
  onFill = vi.fn(),
  onProcess = vi.fn(),
  onStop = vi.fn(),
) {
  render(
    <OperatorToolbar
      robotState="IDLE"
      connectionState="CONNECTED"
      hasActiveGear={false}
      conveyorStatus={status}
      onExecutePose={vi.fn()}
      onConnect={vi.fn()}
      onDisconnect={vi.fn()}
      onResetFault={vi.fn()}
      onClearWorkspace={vi.fn()}
      onFill={onFill}
      onProcess={onProcess}
      onStop={onStop}
    />,
  );
  return { onFill, onProcess, onStop };
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

  it('LOADED: Fill disabled, Process enabled', () => {
    renderToolbar('LOADED');
    expect((screen.getByTestId('fill-button') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('process-button') as HTMLButtonElement).disabled).toBe(false);
  });

  it.each(['FEEDING', 'HALTED'] as const)('%s: both disabled', (status) => {
    renderToolbar(status);
    expect((screen.getByTestId('fill-button') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('process-button') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Unit 8.3a: Stop button gating (hand-sim-ywrn)', () => {
  it('Stop is enabled only while the belt runs, and calls onStop', () => {
    const { onStop } = renderToolbar('FEEDING', vi.fn(), vi.fn());
    const stop = screen.getByTestId('stop-button') as HTMLButtonElement;
    expect(stop.disabled).toBe(false);
    fireEvent.click(stop);
    expect(onStop).toHaveBeenCalledOnce();
  });

  it('STOPPED: Fill stays disabled, Process enabled, Stop disabled', () => {
    renderToolbar('STOPPED', vi.fn(), vi.fn());
    expect((screen.getByTestId('fill-button') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('process-button') as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTestId('stop-button') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Unit 9.11: gating derives from cell_state alone (hand-sim-q2ur)', () => {
  it.each([
    ['EMPTY', { fill: true, process: false, stop: false }],
    ['LOADED', { fill: false, process: true, stop: false }],
    ['FEEDING', { fill: false, process: false, stop: true }],
    ['HALTED', { fill: false, process: false, stop: true }],
    ['STOPPED', { fill: false, process: true, stop: false }],
    ['FAULT', { fill: false, process: false, stop: false }],
    ['RESETTING', { fill: false, process: false, stop: false }],
  ] as const)('%s enables exactly the expected intents', (status, enabled) => {
    renderToolbar(status);
    const on = (id: string) => !(screen.getByTestId(id) as HTMLButtonElement).disabled;
    expect({
      fill: on('fill-button'),
      process: on('process-button'),
      stop: on('stop-button'),
    }).toEqual(enabled);
  });
});

describe('Unit 9.22: RESETTING disables every button (hand-sim-0ceq)', () => {
  it.each(['RESETTING', 'FAULT'] as const)('%s disables poses and Clear Workspace', (status) => {
    render(
      <OperatorToolbar
        robotState="IDLE"
        connectionState="CONNECTED"
        hasActiveGear={true}
        conveyorStatus={status}
        onExecutePose={vi.fn()}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onResetFault={vi.fn()}
        onClearWorkspace={vi.fn()}
        onFill={vi.fn()}
        onProcess={vi.fn()}
        onStop={vi.fn()}
      />,
    );
    expect((screen.getByTestId('clear-workspace-button') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('pose-home-button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('EMPTY keeps Fill enabled once the reset is over', () => {
    renderToolbar('EMPTY');
    expect((screen.getByTestId('fill-button') as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('Reset Fault after a device fault (D20)', () => {
  it('a cell FAULT with the arm IDLE enables Reset Fault and sends it', () => {
    const onResetFault = vi.fn();
    render(
      <OperatorToolbar
        robotState="IDLE"
        connectionState="CONNECTED"
        hasActiveGear={false}
        conveyorStatus="FAULT"
        onExecutePose={vi.fn()}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onResetFault={onResetFault}
        onClearWorkspace={vi.fn()}
        onFill={vi.fn()}
        onProcess={vi.fn()}
        onStop={vi.fn()}
      />,
    );
    const reset = screen.getByTestId('reset-fault-button') as HTMLButtonElement;
    expect(reset.disabled).toBe(false);
    fireEvent.click(reset);
    expect(onResetFault).toHaveBeenCalledOnce();
  });
});
