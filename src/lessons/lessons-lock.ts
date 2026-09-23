/**
 * Process lock for lessons-graph writes.
 *
 * Multiple harnesses can call `agentsmesh lessons add` concurrently — capture
 * the rule once per failure, even when a hooked CI step and the user's editor
 * race for the same `lessons.json`. The lock lives at
 * `.agentsmesh/lessons/.lessons.lock` and reuses the same `acquireProcessLock`
 * primitive as `.install.lock` / `.generate.lock`, with its own timing below.
 */

import { resolve } from 'node:path';
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
  return acquireProcessLock(lessonsLockPath(projectRoot), {
    retries: opts.retries ?? LESSONS_LOCK_OPTIONS.retries,
    retryDelayMs: opts.retryDelayMs ?? LESSONS_LOCK_OPTIONS.retryDelayMs,
    maxRetryDelayMs: opts.maxRetryDelayMs ?? LESSONS_LOCK_OPTIONS.maxRetryDelayMs,
    jitter: opts.jitter ?? LESSONS_LOCK_OPTIONS.jitter,
    staleMs: opts.staleMs ?? LESSONS_LOCK_OPTIONS.staleMs,
    label: 'lessons lock',
  });
}
