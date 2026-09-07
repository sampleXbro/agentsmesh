/**
 * Cross-platform process lock backed by an atomic mkdir.
 *
 * Stale recovery: the holder writes its PID and start timestamp into the lock
 * dir. A dead same-host holder is evicted at once. A live or remote holder is
 * evicted only past `staleMs` — an hours-long bound that catches a hung
 * process or a recycled PID, never a slow but healthy run.
 */

import { mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { hostname } from 'node:os';
import { dirname, join } from 'node:path';
import { LockAcquisitionError } from '../../core/errors.js';

const DEFAULT_STALE_MS = 6 * 60 * 60 * 1000;
const DEFAULT_RETRIES = 30;
const DEFAULT_RETRY_DELAY_MS = 200;
// `tryAcquire` does `mkdir(lockPath)` then `writeFile(holder.json)`. Between
// those two calls, a competing acquirer can see the lock dir without metadata.
// Treat such a dir as held (not orphaned) for this grace window so the in-flight
// owner gets a chance to finish writing `holder.json`. Older missing-metadata
// dirs are still evicted as orphaned.
const YOUNG_LOCK_GRACE_MS = 2_000;

interface LockMetadata {
  pid: number;
  started: number;
  hostname?: string;
}

export interface LockOptions {
  /** Maximum retry attempts before throwing LockAcquisitionError. */
  retries?: number;
  /** Delay between retries in ms. */
  retryDelayMs?: number;
  /**
   * Secondary age bound (default 6h): a lock older than this is evicted even
   * when its holder PID is still alive or cannot be probed (other host).
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
  const delay = opts.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const stale = opts.staleMs ?? DEFAULT_STALE_MS;

  await mkdir(dirname(lockPath), { recursive: true });

  let attempt = 0;
  while (true) {
    const acquired = await tryAcquire(lockPath);
    if (acquired) return acquired;

    const existing = await inspectLock(lockPath);
    if (existing !== 'young' && isStale(existing, stale)) {
      await rm(lockPath, { recursive: true, force: true });
      // Stale eviction is bookkeeping, not a wait — try again without consuming retry budget.
      continue;
    }

    if (attempt >= retries) {
      const holder = existing === 'young' ? null : existing;
      throw new LockAcquisitionError(lockPath, describeHolder(holder), { label: opts.label });
    }
    attempt++;
    await sleep(delay);
  }
}

async function tryAcquire(lockPath: string): Promise<LockRelease | null> {
  try {
    await mkdir(lockPath, { recursive: false });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return null;
    throw err;
  }

  const metadataPath = join(lockPath, 'holder.json');
  const metadata: LockMetadata = {
    pid: process.pid,
    started: Date.now(),
    hostname: getHostname(),
  };
  try {
    await writeFile(metadataPath, JSON.stringify(metadata), 'utf-8');
  } catch (error) {
    await rm(lockPath, { recursive: true, force: true }).catch(() => {});
    throw error;
  }

  let released = false;
  const cleanup = (): void => {
    if (released) return;
    released = true;
    try {
      rmSync(lockPath, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup on signal/exit.
    }
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
    await rm(lockPath, { recursive: true, force: true }).catch(() => {});
  };
}

async function inspectLock(lockPath: string): Promise<LockMetadata | 'young' | null> {
  try {
    const raw = await readFile(join(lockPath, 'holder.json'), 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (!isLockMetadata(parsed)) return null;
    return parsed;
  } catch {
    // holder.json is missing or unreadable. The lock dir is either still
    // bootstrapping its metadata (young) or genuinely orphaned (old).
    // Allow negative `ageMs` because under suite-load the directory's mtime
    // can be a hair ahead of `Date.now()` due to FS-vs-clock resolution skew;
    // such a dir is by definition young.
    try {
      const info = await stat(lockPath);
      const ageMs = Date.now() - info.mtimeMs;
      if (ageMs < YOUNG_LOCK_GRACE_MS) return 'young';
    } catch {
      // lockPath gone — treat as null so the next tryAcquire can mkdir.
    }
    return null;
  }
}

function isStale(meta: LockMetadata | null, staleMs: number): boolean {
  if (!meta) return true;
  const sameHost = !meta.hostname || meta.hostname === getHostname();
  if (sameHost && !isProcessAlive(meta.pid)) return true;
  return Date.now() - meta.started > staleMs;
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // ESRCH = no such process. EPERM = process exists but not ours (still alive).
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function describeHolder(meta: LockMetadata | null): string {
  if (!meta) return 'unknown (unreadable lock metadata)';
  const host = meta.hostname ? `${meta.hostname}:` : '';
  return `${host}pid ${meta.pid} (running ${Date.now() - meta.started}ms)`;
}

function isLockMetadata(value: unknown): value is LockMetadata {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.pid === 'number' && typeof v.started === 'number';
}

function getHostname(): string {
  return hostname();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
