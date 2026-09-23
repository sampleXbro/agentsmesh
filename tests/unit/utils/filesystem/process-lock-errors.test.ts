/**
 * A process lock reports a filesystem error it cannot handle instead of
 * treating it as contention: a missing parent folder while claiming, or a
 * failed move while dropping a lock left by an older version.
 */

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const renameMock = vi.hoisted(() => vi.fn<(from: string, to: string) => Promise<void>>());

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  renameMock.mockImplementation(actual.rename);
  return { ...actual, rename: renameMock };
});

const { evict, tryAcquire } = await import('../../../../src/utils/filesystem/process-lock-ops.js');

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-lock-errors-'));
});
afterEach(() => {
  vi.clearAllMocks();
  rmSync(root, { recursive: true, force: true });
});

describe('process lock errors', () => {
  it('tryAcquire throws when the lock folder cannot be created', async () => {
    const lockPath = join(root, 'missing-parent', '.x.lock');

    await expect(tryAcquire(lockPath, { pid: 1, started: 0, token: 't' })).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('evicting an older-version lock throws when it cannot be moved aside', async () => {
    const lockPath = join(root, '.x.lock');
    mkdirSync(lockPath);
    renameMock.mockRejectedValueOnce(Object.assign(new Error('EINVAL'), { code: 'EINVAL' }));

    await expect(
      evict(lockPath, { kind: 'legacy', meta: { pid: 1, started: 0 }, raw: '{}' }),
    ).rejects.toMatchObject({ code: 'EINVAL' });
  });
});
