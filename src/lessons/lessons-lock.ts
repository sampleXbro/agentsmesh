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
  type HeldLock,
  type LockOptions,
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
): Promise<HeldLock> {
  return acquireProcessLock(lessonsLockPath(projectRoot), {
    retries: opts.retries ?? LESSONS_LOCK_OPTIONS.retries,
    retryDelayMs: opts.retryDelayMs ?? LESSONS_LOCK_OPTIONS.retryDelayMs,
    maxRetryDelayMs: opts.maxRetryDelayMs ?? LESSONS_LOCK_OPTIONS.maxRetryDelayMs,
    jitter: opts.jitter ?? LESSONS_LOCK_OPTIONS.jitter,
    staleMs: opts.staleMs ?? LESSONS_LOCK_OPTIONS.staleMs,
    label: 'lessons lock',
  });
}

/** The lessons lock was evicted as stale while this process held it; nothing was saved. */
export class LessonsLockLostError extends Error {
  constructor() {
    super(
      'lost the lessons lock while writing (the process was paused longer than the ' +
        `${LESSONS_LOCK_OPTIONS.staleMs / 1000} s stale window?); nothing was saved — retry the command`,
    );
    this.name = 'LessonsLockLostError';
  }
}

/** Call right before saving: throws LessonsLockLostError once `lock` no longer owns the lock. */
export async function assertLessonsLockHeld(lock: HeldLock): Promise<void> {
  if (!(await lock.isHeld())) throw new LessonsLockLostError();
}
