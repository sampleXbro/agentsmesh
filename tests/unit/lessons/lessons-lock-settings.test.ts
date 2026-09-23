import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  acquireLessonsLock,
  lessonsLockPath,
  LESSONS_LOCK_OPTIONS,
} from '../../../src/lessons/lessons-lock.js';
import { acquireProcessLock } from '../../../src/utils/filesystem/process-lock.js';
import { lockRetryDelayMs } from '../../../src/utils/filesystem/process-lock-backoff.js';
import { LockAcquisitionError } from '../../../src/core/errors.js';

type ProcessLockModule = typeof import('../../../src/utils/filesystem/process-lock.js');

vi.mock('../../../src/utils/filesystem/process-lock.js', async (importOriginal) => {
  const actual = await importOriginal<ProcessLockModule>();
  return { ...actual, acquireProcessLock: vi.fn(actual.acquireProcessLock) };
});

let root = '';

beforeEach(() => {
  vi.mocked(acquireProcessLock).mockClear();
  root = mkdtempSync(join(tmpdir(), 'am-lessons-lock-settings-'));
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

const EXPECTED = {
  retries: 500,
  retryDelayMs: 25,
  maxRetryDelayMs: 250,
  jitter: true,
  staleMs: 60_000,
  label: 'lessons lock',
};

function writeRemoteHolder(ageMs: number): void {
  const lockPath = lessonsLockPath(root);
  mkdirSync(lockPath, { recursive: true });
  const holder = { pid: 4242, started: Date.now() - ageMs, hostname: 'devcontainer-not-here' };
  writeFileSync(join(lockPath, 'holder.json'), JSON.stringify(holder));
}

describe('acquireLessonsLock — settings', () => {
  it('uses a one-minute stale window and a jittered, long retry budget', async () => {
    const release = await acquireLessonsLock(root);
    await release();
    expect(vi.mocked(acquireProcessLock).mock.calls).toEqual([[lessonsLockPath(root), EXPECTED]]);
    expect(LESSONS_LOCK_OPTIONS).toEqual({
      retries: 500,
      retryDelayMs: 25,
      maxRetryDelayMs: 250,
      jitter: true,
      staleMs: 60_000,
    });
  });

  it('an explicit retries value overrides only the retry count; undefined keeps the default', async () => {
    for (const retries of [undefined, 3]) {
      const release = await acquireLessonsLock(root, { retries });
      await release();
    }
    expect(vi.mocked(acquireProcessLock).mock.calls).toEqual([
      [lessonsLockPath(root), EXPECTED],
      [lessonsLockPath(root), { ...EXPECTED, retries: 3 }],
    ]);
  });

  it('waits at least the stale window before giving up, even with the unluckiest jitter', () => {
    let shortest = 0;
    for (let attempt = 1; attempt <= LESSONS_LOCK_OPTIONS.retries; attempt++) {
      shortest += lockRetryDelayMs(attempt, LESSONS_LOCK_OPTIONS, () => 0);
    }
    expect(shortest).toBeGreaterThan(LESSONS_LOCK_OPTIONS.staleMs);
  });

  it('evicts a lock left by another host once it is older than a minute', async () => {
    writeRemoteHolder(90_000);
    const release = await acquireLessonsLock(root, { retries: 0 });
    const holder = JSON.parse(readFileSync(join(lessonsLockPath(root), 'holder.json'), 'utf-8'));
    expect(holder.pid).toBe(process.pid);
    await release();
  });

  it('keeps a fresh lock held by another host', async () => {
    writeRemoteHolder(5_000);
    await expect(acquireLessonsLock(root, { retries: 0 })).rejects.toBeInstanceOf(
      LockAcquisitionError,
    );
  });
});
