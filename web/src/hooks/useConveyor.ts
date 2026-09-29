import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { PickAndPlaceTargetPayload, SpawnObjectPayload } from '@contracts';
import {
  ConveyorAbortedError,
  buildDeck,
  runDeck,
  type ConveyorPorts,
  type ConveyorStatus,
  type GearSpec,
} from '@utils/conveyorController';
import type { BeltFeeder } from '@utils/beltFeeder';
import { isPickSettled, spawnedCount, type WorkcellBuckets } from '@utils/workcellProgress';
import type { WaitOptions } from '@/hooks/useWorkcellWaiters';

const FEED_TICK_MS = 33;
/** Longest real interval simulated in one tick (a busy or throttled tab catches up, bounded). */
const MAX_FEED_REAL_DT_S = 0.25;
/** The feeder is stepped in chunks this small, so a long tick never skips the spawn schedule. */
const FEED_CHUNK_S = 0.05;
const REGISTER_TIMEOUT_MS = 10_000;
const ARM_MOTION_TIMEOUT_MS = 60_000;

export interface UseConveyorParams {
  /** False on disconnect: hopper, belt and any run are reset (ADR 0005 §5). */
  connected: boolean;
  robotState: string | null;
  workcell: () => WorkcellBuckets | undefined;
  spawnObject: (payload: SpawnObjectPayload) => void;
  pickAndPlace: (payload: PickAndPlaceTargetPayload) => void;
  goHomePose: () => void;
  /** True while the reported joints are at the HOME pose. */
  armAtHome: () => boolean;
  waitUntil: (ready: () => boolean, opts: WaitOptions) => Promise<void>;
  /** Surfaces conveyor events/errors in the EventLog. */
  report: (status: string, detail: string) => void;
  /** Deterministic deck and belt randomness (tests, E2E); defaults to the clock. */
  seed?: number;
  /** Belt simulation speed-up for tests; 1 = real time. */
  timeScale?: number;
}

interface Feed {
  timer: ReturnType<typeof setInterval>;
  reject: (err: Error) => void;
}

/**
 * TeleopClient-local hopper / belt / run lifecycle (ADR 0005); never on the wire. Process runs the
 * whole deck through `runDeck`; failures are reported to the EventLog and rethrown, never swallowed.
 */
export function useConveyor({
  connected,
  robotState,
  workcell,
  spawnObject,
  pickAndPlace,
  goHomePose,
  armAtHome,
  waitUntil,
  report,
  seed,
  timeScale = 1,
}: UseConveyorParams) {
  const [conveyorStatus, setConveyorStatus] = useState<ConveyorStatus>('EMPTY');
  const [deck, setDeck] = useState<GearSpec[]>([]);
  const feederRef = useRef<BeltFeeder | null>(null);
  const feedRef = useRef<Feed | null>(null);
  const runIdRef = useRef(0);
  const robotStateRef = useRef(robotState);
  robotStateRef.current = robotState;

  const cancelFeed = useCallback((reason: string) => {
    const feed = feedRef.current;
    feedRef.current = null;
    if (!feed) return;
    clearInterval(feed.timer);
    feed.reject(new ConveyorAbortedError(reason));
  }, []);
  useEffect(() => () => cancelFeed('TeleopClient unmounted'), [cancelFeed]);

  useEffect(() => {
    if (connected && robotState !== 'FAULT') return;
    runIdRef.current += 1; // any run in flight stops at its next phase boundary
    cancelFeed('session reset');
    feederRef.current = null;
    setDeck([]);
    setConveyorStatus('EMPTY');
  }, [connected, robotState, cancelFeed]);

  const handleFill = useCallback(() => {
    setDeck(buildDeck(seed));
    setConveyorStatus('LOADED');
  }, [seed]);

  const feedUntilHalted = useCallback(
    (feeder: BeltFeeder) =>
      new Promise<void>((resolve, reject) => {
        let last = performance.now();
        const timer = setInterval(() => {
          const now = performance.now();
          let left = Math.min((now - last) / 1000, MAX_FEED_REAL_DT_S) * timeScale;
          last = now;
          while (left > 0 && feeder.status() === 'FEEDING') {
            const chunk = Math.min(left, FEED_CHUNK_S);
            feeder.step(chunk);
            left -= chunk;
          }
          setDeck((prev) =>
            prev.length === feeder.remaining().length ? prev : [...feeder.remaining()],
          );
          if (feeder.status() === 'HALTED') {
            clearInterval(timer);
            feedRef.current = null;
            resolve();
          }
        }, FEED_TICK_MS);
        feedRef.current = { timer, reject };
      }),
    [timeScale],
  );

  const handleProcess = useCallback(() => {
    const runId = ++runIdRef.current;
    const ports: ConveyorPorts = {
      spawn: spawnObject,
      pickAndPlace,
      waitForRegistered: () =>
        waitUntil(() => spawnedCount(workcell()) > 0, {
          what: 'the spawned gear to be registered',
          timeoutMs: REGISTER_TIMEOUT_MS,
        }),
      waitForSettled: () =>
        waitUntil(() => isPickSettled(robotStateRef.current, workcell()), {
          what: 'the pick to finish (arm IDLE, no gear in flight)',
          timeoutMs: ARM_MOTION_TIMEOUT_MS,
        }),
      goHome: async () => {
        goHomePose();
        // State-based, not edge-based: a fast HOME can go EXECUTING -> IDLE inside one render.
        await waitUntil(() => robotStateRef.current === 'IDLE' && armAtHome(), {
          what: 'the arm to reach HOME',
          timeoutMs: ARM_MOTION_TIMEOUT_MS,
        });
      },
    };
    runDeck(deck, {
      ports,
      seed: seed ?? Date.now(),
      feedUntilHalted,
      assertActive: () => {
        if (runIdRef.current !== runId) throw new ConveyorAbortedError('run superseded or reset');
      },
      onFeeder: (feeder) => {
        feederRef.current = feeder;
      },
      onStatus: setConveyorStatus,
    }).catch((err: unknown) => {
      if (err instanceof ConveyorAbortedError) {
        report('CONVEYOR_ABORTED', err.message);
        return;
      }
      console.error('Conveyor run failed', err);
      report('CONVEYOR_ERROR', err instanceof Error ? err.message : String(err));
      cancelFeed('conveyor run failed');
      setConveyorStatus('STOPPED');
      throw err;
    });
  }, [
    deck,
    seed,
    spawnObject,
    pickAndPlace,
    goHomePose,
    armAtHome,
    waitUntil,
    workcell,
    feedUntilHalted,
    report,
    cancelFeed,
  ]);

  return { conveyorStatus, deck, feederRef, handleFill, handleProcess };
}
