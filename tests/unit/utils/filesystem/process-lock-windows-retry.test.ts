/**
 * On Windows, a lock folder or owner marker that another process is removing
 * at the same moment is "delete pending": mkdir and rmdir on it fail with EPERM
 * or EBUSY for a short time. Claiming and evicting retry that, so a waiting
 * process neither crashes nor loses its turn; an error that does not clear
 * still throws.
 */

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rmdirMock = vi.hoisted(() => vi.fn<(path: string) => Promise<void>>());
const mkdirMock = vi.hoisted(() => vi.fn<(path: string) => Promise<void>>());

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  mkdirMock.mockImplementation((path) => actual.mkdir(path));
  return { ...actual, rmdir: rmdirMock, mkdir: mkdirMock };
});

const { evictOwners, tryAcquire } = await import(
  '../../../../src/utils/filesystem/process-lock-ops.js'
);
const { ownerPath } = await import('../../../../src/utils/filesystem/process-lock-state.js');

const fail = (code: string): Error => Object.assign(new Error(code), { code });
const META = { pid: process.pid, started: 0, token: 'tok' };

let root: string;
let lockPath: string;
let owner: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-lock-win-retry-'));
  lockPath = join(root, '.x.lock');
  owner = ownerPath(lockPath, 'tok');
  rmdirMock.mockReset();
  mkdirMock.mockClear();
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('tryAcquire — a lock folder another process is removing', () => {
  it('claims the lock once EPERM clears', async () => {
    mkdirMock.mockRejectedValueOnce(fail('EPERM'));

    await expect(tryAcquire(lockPath, META)).resolves.toBe(true);

    expect(mkdirMock.mock.calls.map(([p]) => p)).toEqual([lockPath, lockPath, owner]);
    expect(existsSync(owner)).toBe(true);
  });

  it('reports contention when another process recreates it meanwhile', async () => {
    mkdirMock.mockRejectedValueOnce(fail('EBUSY')).mockRejectedValueOnce(fail('EEXIST'));

    await expect(tryAcquire(lockPath, META)).resolves.toBe(false);
  });
});

describe('evictOwners — a marker another process is removing', () => {
  it('treats a marker that is gone after EPERM as already removed', async () => {
    rmdirMock.mockRejectedValueOnce(fail('EPERM')).mockRejectedValueOnce(fail('ENOENT'));

    await expect(evictOwners(lockPath, ['tok'])).resolves.toBeUndefined();

    expect(rmdirMock.mock.calls).toEqual([[owner], [owner]]);
  });

  it('removes the marker once EBUSY clears, then tears the lock down', async () => {
    rmdirMock.mockRejectedValueOnce(fail('EBUSY')).mockResolvedValue(undefined);

    await evictOwners(lockPath, ['tok']);

    expect(rmdirMock.mock.calls).toEqual([[owner], [owner], [lockPath]]);
  });

  it('still throws an error that does not clear', async () => {
    rmdirMock.mockRejectedValue(fail('EPERM'));

    await expect(evictOwners(lockPath, ['tok'])).rejects.toMatchObject({ code: 'EPERM' });

    expect(rmdirMock).toHaveBeenCalledTimes(5);
  });
});
