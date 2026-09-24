/**
 * On Windows, any call on a lock folder that another process is removing at
 * the same moment ("delete pending") fails with EPERM, EACCES or EBUSY for a
 * short time. acquireProcessLock treats that like a busy lock and tries again
 * after a short wait, and removing a stale owner marker retries too; five such
 * errors in a row still throw, so a real permission problem is not hidden.
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync } from 'node:fs';
import type { MakeDirectoryOptions } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type MkdirFn = (path: string, opts?: MakeDirectoryOptions) => Promise<string | undefined>;
const mkdirMock = vi.hoisted(() => vi.fn<MkdirFn>());
const readdirMock = vi.hoisted(() => vi.fn<(path: string) => Promise<string[]>>());
const rmdirMock = vi.hoisted(() => vi.fn<(path: string) => Promise<void>>());

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, mkdir: mkdirMock, readdir: readdirMock, rmdir: rmdirMock };
});

const real = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
const { acquireProcessLock } = await import('../../../../src/utils/filesystem/process-lock.js');
const { evictOwners } = await import('../../../../src/utils/filesystem/process-lock-ops.js');
const { ownerPath } = await import('../../../../src/utils/filesystem/process-lock-state.js');

const fail = (code: string): Error => Object.assign(new Error(code), { code });
const OPTS = { retryDelayMs: 1 };

let root: string;
let lockPath: string;
/** Calls on the lock folder still to fail, per function. */
let failures: { mkdir: number; readdir: number };
const lockCalls = (mock: typeof mkdirMock | typeof readdirMock): number =>
  mock.mock.calls.filter(([p]) => p === lockPath).length;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-lock-win-retry-'));
  lockPath = join(root, '.x.lock');
  failures = { mkdir: 0, readdir: 0 };
  mkdirMock.mockReset().mockImplementation((path, opts) => {
    if (path !== lockPath || failures.mkdir === 0) return real.mkdir(path, opts);
    failures.mkdir -= 1;
    return Promise.reject(fail('EPERM'));
  });
  readdirMock.mockReset().mockImplementation((path) => {
    if (path !== lockPath || failures.readdir === 0) return real.readdir(path);
    failures.readdir -= 1;
    return Promise.reject(fail('EBUSY'));
  });
  rmdirMock.mockReset().mockImplementation((path) => real.rmdir(path));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('acquireProcessLock on a lock folder another process is removing', () => {
  it('claims the lock once EPERM on its folder clears', async () => {
    failures.mkdir = 2;

    const lock = await acquireProcessLock(lockPath, OPTS);

    expect([lockCalls(mkdirMock), await lock.isHeld()]).toEqual([3, true]);
    await lock();
  });

  it('inspects the lock again after EBUSY, then evicts an abandoned one', async () => {
    mkdirSync(lockPath);
    const old = new Date(Date.now() - 60 * 60 * 1000);
    utimesSync(lockPath, old, old);
    failures.readdir = 1;

    const lock = await acquireProcessLock(lockPath, OPTS);

    expect([failures.readdir, existsSync(lockPath), await lock.isHeld()]).toEqual([0, true, true]);
    await lock();
  });

  it('throws an error that does not clear after 5 tries in a row', async () => {
    failures.mkdir = Number.POSITIVE_INFINITY;

    await expect(acquireProcessLock(lockPath, OPTS)).rejects.toMatchObject({ code: 'EPERM' });

    expect(lockCalls(mkdirMock)).toBe(5);
  });
});

describe('evictOwners on a marker another process is removing', () => {
  it('treats a marker that is gone after EPERM as already removed', async () => {
    const owner = ownerPath(lockPath, 'tok');
    rmdirMock.mockRejectedValueOnce(fail('EPERM')).mockRejectedValueOnce(fail('ENOENT'));

    await expect(evictOwners(lockPath, ['tok'])).resolves.toBeUndefined();

    expect(rmdirMock.mock.calls).toEqual([[owner], [owner]]);
  });

  it('still throws an error that does not clear after 5 attempts', async () => {
    rmdirMock.mockRejectedValue(fail('EPERM'));

    await expect(evictOwners(lockPath, ['tok'])).rejects.toMatchObject({ code: 'EPERM' });

    expect(rmdirMock).toHaveBeenCalledTimes(5);
  });
});
