/**
 * Cross-platform process lock backed by an atomic mkdir.
 *
 * Each acquisition gets a random owner token, kept as an `owner-<token>` marker
 * in the lock dir next to `holder.json` (pid, host, start time). The lock
 * changes hands only by removing that exact marker, so neither a release nor
 * a stale eviction can delete a lock that already passed to another process.
 *
 * Stale recovery: a dead same-host holder, or a live pid that now belongs to
 * another process, is evicted at once. Any holder older than `staleMs` (or
 * dated in the future past clock skew) is evicted too — the bound for hung
 * processes and holders on other hosts. A holder evicted this way sees
 * `isHeld()` turn false, so it can refuse to write.
 */

import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { hostname } from 'node:os';
import { dirname } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { LockAcquisitionError } from '../../core/errors.js';
import { selfIdentity } from './process-identity.js';
import { evict, evictOwners, releaseOwnedSync, tryAcquire } from './process-lock-ops.js';
import {
  describeHolder,
  inspectLock,
  isStale,
  ownerPath,
  type LockMetadata,
  type LockState,
  type ProbeCache,
} from './process-lock-state.js';

const DEFAULT_STALE_MS = 6 * 60 * 60 * 1000;
const DEFAULT_RETRIES = 30;
const DEFAULT_RETRY_DELAY_MS = 200;
// Evictions and vanished locks retry at once; this caps a run of them.
const MAX_IMMEDIATE_RETRIES = 100;

export interface LockOptions {
  /** Maximum retry attempts before throwing LockAcquisitionError. */
  retries?: number;
  /** Delay before the first retry in ms (default 200). */
  retryDelayMs?: number;
  /** Cap for the doubling delay. Defaults to `retryDelayMs`, i.e. a fixed delay. */
  maxRetryDelayMs?: number;
  /** Spread each delay over the upper half of its window so waiters do not retry in step. */
  jitter?: boolean;
  /**
   * Age bound (default 6h): a lock older than this is evicted even when its
   * holder is still alive or cannot be probed (other host).
   */
  staleMs?: number;
  /** Human-readable lock name surfaced in LockAcquisitionError, e.g. "lessons lock". */
  label?: string;
  /** Called once, with the holder, when a wait lasts `waitNoticeMs` (default 2000). */
  onWait?: (holder: string) => void;
  waitNoticeMs?: number;
}

export type LockRelease = () => Promise<void>;

/** The release function of an acquired lock. */
export interface HeldLock extends LockRelease {
  /**
   * False once this acquisition no longer owns the lock: released, or evicted
   * as stale (e.g. the process was paused longer than `staleMs`). Check it
   * right before a write that must not overwrite a later holder's work.
   */
  isHeld(): Promise<boolean>;
}

/**
 * Acquire an exclusive process-level lock.
 *
 * @param lockPath - Absolute path where the lock directory will be created.
 * @param opts - Retry/stale tuning knobs.
 * @returns A release function (with `isHeld()`); callers must invoke it in a `finally` block.
 * @throws {LockAcquisitionError} if the lock cannot be acquired within the retry budget.
 */
export async function acquireProcessLock(
  lockPath: string,
  opts: LockOptions = {},
): Promise<HeldLock> {
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const staleMs = opts.staleMs ?? DEFAULT_STALE_MS;

  await mkdir(dirname(lockPath), { recursive: true });
  const procStart = await selfIdentity();
  const probes: ProbeCache = new Map();

  let attempt = 0;
  let immediate = 0;
  const waitingSince = Date.now();
  let noticed = false;
  while (true) {
    const holder = newHolder(procStart);
    if (await tryAcquire(lockPath, holder)) return holdLock(lockPath, holder.token);

    const state = await inspectLock(lockPath);
    // A vanished or just-evicted lock is bookkeeping, not a wait: no retry budget used.
    if (immediate < MAX_IMMEDIATE_RETRIES && (await clearedNow(lockPath, state, staleMs, probes))) {
      immediate++;
      continue;
    }

    if (attempt >= retries) {
      throw new LockAcquisitionError(lockPath, describeHolder(state), { label: opts.label });
    }
    attempt++;
    immediate = 0;
    if (!noticed && opts.onWait && Date.now() - waitingSince >= (opts.waitNoticeMs ?? 2000)) {
      noticed = true;
      opts.onWait(describeHolder(state));
    }
    await sleep(lockRetryDelayMs(attempt, opts));
  }
}

/** Delay before retry number `attempt` (1-based). */
export function lockRetryDelayMs(
  attempt: number,
  opts: Readonly<LockOptions>,
  random: () => number = Math.random,
): number {
  const base = opts.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const cap = Math.max(base, opts.maxRetryDelayMs ?? base);
  const delay = Math.min(cap, base * 2 ** (attempt - 1));
  return opts.jitter ? delay * (0.5 + random() * 0.5) : delay;
}

/** True when the lock is gone or was just evicted, so the next try needs no wait. */
async function clearedNow(
  lockPath: string,
  state: LockState,
  staleMs: number,
  probes: ProbeCache,
): Promise<boolean> {
  if (state.kind === 'gone') return true;
  if (state.kind === 'young') return false;
  if (state.kind !== 'orphan' && !(await isStale(state.meta, staleMs, probes))) return false;
  await evict(lockPath, state);
  return true;
}

function newHolder(procStart: string | null): LockMetadata & { token: string } {
  return {
    pid: process.pid,
    started: Date.now(),
    hostname: hostname(),
    token: randomUUID(),
    ...(procStart === null ? {} : { procStart }),
  };
}

function holdLock(lockPath: string, token: string): HeldLock {
  let released = false;
  const cleanup = (): void => {
    if (released) return;
    released = true;
    releaseOwnedSync(lockPath, token);
  };
  const signalHandler = (signal: NodeJS.Signals): void => {
    cleanup();
    // Re-raise: a registered listener suppresses the default terminate, so
    // without this the FIRST Ctrl-C would not exit and the critical section
    // would keep running after its lock dir was already removed. `once` has
    // deregistered this listener, so the re-raised signal takes the default
    // disposition (or reaches any other handler the host registered).
    process.kill(process.pid, signal);
  };
  process.once('SIGINT', signalHandler);
  process.once('SIGTERM', signalHandler);
  process.once('exit', cleanup);

  const release = async (): Promise<void> => {
    if (released) return;
    released = true;
    process.off('SIGINT', signalHandler);
    process.off('SIGTERM', signalHandler);
    process.off('exit', cleanup);
    // Removes the lock only while this token still owns it.
    await evictOwners(lockPath, [token]).catch(() => {});
  };
  // The owner marker leaves only through release or eviction (see process-lock-ops.ts).
  const isHeld = async (): Promise<boolean> => !released && existsSync(ownerPath(lockPath, token));
  return Object.assign(release, { isHeld });
}
