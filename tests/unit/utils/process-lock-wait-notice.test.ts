/**
 * A lock held by a live process makes a waiter wait (up to the stale window
 * for the lessons lock) — no longer silently: the waiter says once who holds
 * the lock.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { acquireLessonsLock } from '../../../src/lessons/lessons-lock.js';
import { LockAcquisitionError } from '../../../src/core/errors.js';
import { acquireProcessLock } from '../../../src/utils/filesystem/process-lock.js';
import { logger } from '../../../src/utils/output/logger.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-lock-notice-'));
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

const busy = { retries: 6, retryDelayMs: 20, waitNoticeMs: 40 };

describe('lock wait notice', () => {
  it('calls onWait once, with the holder, after waitNoticeMs', async () => {
    const lock = join(root, 'x.lock');
    const held = await acquireProcessLock(lock);
    const onWait = vi.fn();
    await expect(acquireProcessLock(lock, { ...busy, onWait })).rejects.toThrow(
      LockAcquisitionError,
    );
    expect(onWait).toHaveBeenCalledTimes(1);
    expect(String(onWait.mock.calls[0]![0])).toMatch(new RegExp(`pid ${process.pid} `));
    await held();
  });

  it('the lessons lock prints one notice naming the holder and the takeover time', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const held = await acquireLessonsLock(root);
    await expect(acquireLessonsLock(root, busy)).rejects.toThrow(LockAcquisitionError);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toMatch(
      /^Waiting for the lessons lock, held by .*pid \d+ .*; a lock older than 60 s is taken over\.$/,
    );
    await held();
  });
});
