/**
 * Cross-platform process lock backed by an atomic mkdir.
 *
 * Each acquisition gets a random owner token, kept as an `owner-<token>` marker
 * in the lock dir next to `holder.json` (pid, host, start time). The lock
 * changes hands only by removing that exact marker, so neither a release nor
 * a stale eviction can delete a lock that already passed to another process.
 *
 * Stale recovery: a dead same-host holder, or a live pid that now belongs to
 * another process, is evicted at once. Any holder older than `staleMs` is
 * evicted too — the bound for hung processes and holders on other hosts.
 */

import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { hostname } from 'node:os';
import { dirname } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { LockAcquisitionError } from '../../core/errors.js';
import { selfIdentity } from './process-identity.js';
import { lockRetryDelayMs, type LockBackoffOptions } from './process-lock-backoff.js';
import { evict, releaseOwned, releaseOwnedSync, tryAcquire } from './process-lock-ops.js';
import {
  describeHolder,
  inspectLock,
  isStale,
  type LockMetadata,
  type LockState,
  type ProbeCache,
} from './process-lock-state.js';

const DEFAULT_STALE_MS = 6 * 60 * 60 * 1000;
const DEFAULT_RETRIES = 30;
// Evictions and vanished locks retry at once; this caps a run of them.
const MAX_IMMEDIATE_RETRIES = 100;

export interface LockOptions extends LockBackoffOptions {
  /** Maximum retry attempts before throwing LockAcquisitionError. */
  retries?: number;
  /**
   * Age bound (default 6h): a lock older than this is evicted even when its
   * holder is still alive or cannot be probed (other host).
   */
  staleMs?: number;
  /** Human-readable lock name surfaced in LockAcquisitionError, e.g. "lessons lock". */
  label?: string;
}

export type LockRelease = () => Promise<void>;

/**
 * Acquire an exclusive process-level lock.
 *
 * @param lockPath - Absolute path where the lock directory will be created.
 * @param opts - Retry/stale tuning knobs.
 * @returns A release function; callers must invoke it in a `finally` block.
 * @throws {LockAcquisitionError} if the lock cannot be acquired within the retry budget.
 */
export async function acquireProcessLock(
  lockPath: string,
  opts: LockOptions = {},
): Promise<LockRelease> {
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const staleMs = opts.staleMs ?? DEFAULT_STALE_MS;

  await mkdir(dirname(lockPath), { recursive: true });
  const procStart = await selfIdentity();
  const probes: ProbeCache = new Map();

  let attempt = 0;
  let immediate = 0;
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
    await sleep(lockRetryDelayMs(attempt, opts));
  }
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

function holdLock(lockPath: string, token: string): LockRelease {
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

  return async () => {
    if (released) return;
    released = true;
    process.off('SIGINT', signalHandler);
    process.off('SIGTERM', signalHandler);
    process.off('exit', cleanup);
    // Removes the lock only while this token still owns it.
    await releaseOwned(lockPath, token).catch(() => {});
  };
}
