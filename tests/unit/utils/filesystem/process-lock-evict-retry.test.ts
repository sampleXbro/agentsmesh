/**
 * On Windows, removing an owner marker that another process is removing at the
 * same moment fails with EPERM or EBUSY for a short time. Eviction retries it,
 * so a waiting process sees the marker gone instead of crashing; an error that
 * does not clear still throws.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rmdirMock = vi.hoisted(() => vi.fn<(path: string) => Promise<void>>());

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, rmdir: rmdirMock };
});

const { evictOwners } = await import('../../../../src/utils/filesystem/process-lock-ops.js');
const { ownerPath } = await import('../../../../src/utils/filesystem/process-lock-state.js');

const fail = (code: string): Error => Object.assign(new Error(code), { code });

let lockPath: string;
let owner: string;
beforeEach(() => {
  lockPath = mkdtempSync(join(tmpdir(), 'am-lock-evict-retry-'));
  owner = ownerPath(lockPath, 'tok');
  rmdirMock.mockReset();
});
afterEach(() => rmSync(lockPath, { recursive: true, force: true }));

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
