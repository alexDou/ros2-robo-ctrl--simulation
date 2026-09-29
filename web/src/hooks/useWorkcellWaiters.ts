import { useCallback, useEffect, useRef } from 'preact/hooks';
import { ConveyorAbortedError } from '@utils/conveyorController';
import type { ConnectionState } from '@/hooks/useTeleopSession';

export interface WaitOptions {
  /** What is being waited for; named in the timeout error. */
  what: string;
  timeoutMs: number;
}

/** Re-check interval: a condition can become true without any render (batched telemetry). */
const POLL_MS = 50;

interface Waiter {
  ready: () => boolean;
  resolve: () => void;
  reject: (err: Error) => void;
}

/**
 * Promise-based waits on telemetry-driven conditions. `waitUntil` resolves once `ready()` holds
 * (re-checked whenever the robot state or workcell snapshot changes), rejects on timeout, and
 * rejects with ConveyorAbortedError when the session drops or faults (ADR 0005 §5).
 */
export function useWorkcellWaiters(
  connectionState: ConnectionState,
  robotState: string | null,
  workcellVersion: unknown,
) {
  const waitersRef = useRef<Waiter[]>([]);

  useEffect(() => {
    if (connectionState !== 'CONNECTED' || robotState === 'FAULT') {
      const reason = `session ${connectionState}/${robotState ?? 'unknown'}`;
      for (const w of waitersRef.current) w.reject(new ConveyorAbortedError(reason));
      waitersRef.current = [];
      return;
    }
    waitersRef.current = waitersRef.current.filter((w) => {
      if (!w.ready()) return true;
      w.resolve();
      return false;
    });
  }, [connectionState, robotState, workcellVersion]);

  return useCallback(
    (ready: () => boolean, { what, timeoutMs }: WaitOptions) =>
      new Promise<void>((resolve, reject) => {
        if (ready()) {
          resolve();
          return;
        }
        const settle = () => {
          clearTimeout(timer);
          clearInterval(poll);
          waitersRef.current = waitersRef.current.filter((w) => w !== waiter);
        };
        const timer = setTimeout(() => {
          settle();
          reject(new Error(`Timed out after ${timeoutMs} ms waiting for ${what}`));
        }, timeoutMs);
        const poll = setInterval(() => {
          if (!ready()) return;
          settle();
          resolve();
        }, POLL_MS);
        const waiter: Waiter = {
          ready,
          resolve: () => {
            settle();
            resolve();
          },
          reject: (err) => {
            settle();
            reject(err);
          },
        };
        waitersRef.current.push(waiter);
      }),
    [],
  );
}
