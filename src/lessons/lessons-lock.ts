/**
 * Process lock for lessons-graph writes.
 *
 * Multiple harnesses can call `agentsmesh lessons add` concurrently — capture
 * the rule once per failure, even when a hooked CI step and the user's editor
 * race for the same `lessons.json`. The lock lives at
 * `.agentsmesh/lessons/.lessons.lock` and reuses the same `acquireProcessLock`
 * primitive as `.install.lock` / `.generate.lock`, with its own timing below.
 */

import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  acquireProcessLock,
  type LockOptions,
  type LockRelease,
} from '../utils/filesystem/process-lock.js';

export const LESSONS_LOCK_FILENAME = '.lessons.lock';

/**
 * A lessons write holds the lock for milliseconds, so a lock older than a
 * minute is abandoned (reused pid, other host, devcontainer). Many parallel
 * captures queue behind each other, so waiters back off with jitter and wait
 * longer than the stale window before giving up.
 */
export const LESSONS_LOCK_OPTIONS = Object.freeze({
  retries: 500,
  retryDelayMs: 25,
  maxRetryDelayMs: 250,
  jitter: true,
  staleMs: 60_000,
});

export function lessonsLockPath(projectRoot: string): string {
  return resolve(projectRoot, '.agentsmesh/lessons', LESSONS_LOCK_FILENAME);
}

export async function acquireLessonsLock(
  projectRoot: string,
  opts: LockOptions = {},
): Promise<LockRelease> {
  const lockPath = lessonsLockPath(projectRoot);
  await mkdir(dirname(lockPath), { recursive: true });
  const defaults = LESSONS_LOCK_OPTIONS;
  return acquireProcessLock(lockPath, {
    retries: opts.retries ?? defaults.retries,
    retryDelayMs: opts.retryDelayMs ?? defaults.retryDelayMs,
    maxRetryDelayMs: opts.maxRetryDelayMs ?? defaults.maxRetryDelayMs,
    jitter: opts.jitter ?? defaults.jitter,
    staleMs: opts.staleMs ?? defaults.staleMs,
    label: 'lessons lock',
  });
}
