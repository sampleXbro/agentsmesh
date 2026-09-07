import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireProcessLock } from '../../../src/utils/filesystem/process-lock.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs/promises')>();
  return { ...real, rm: vi.fn(real.rm), writeFile: vi.fn(real.writeFile) };
});

const real = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
let root: string;
let lockPath: string;

beforeEach(async () => {
  vi.mocked(rm).mockReset().mockImplementation(real.rm);
  vi.mocked(writeFile).mockReset().mockImplementation(real.writeFile);
  root = await mkdtemp(join(tmpdir(), 'am-lock-recovery-'));
  lockPath = join(root, '.generate.lock');
});

afterEach(async () => {
  await real.rm(root, { recursive: true, force: true });
});

describe('process lock filesystem failure recovery', () => {
  it('surfaces a stale eviction error instead of retrying beyond the budget', async () => {
    await mkdir(lockPath);
    const metadata = JSON.stringify({ pid: 0, started: 0 });
    await writeFile(join(lockPath, 'holder.json'), metadata);
    const failure = Object.assign(new Error('cannot remove stale lock'), { code: 'EACCES' });
    vi.mocked(rm).mockRejectedValueOnce(failure);

    // A later successful eviction bounds the buggy implementation's otherwise endless loop.
    await expect(
      acquireProcessLock(lockPath, { retries: 0 }).then((release) => release()),
    ).rejects.toBe(failure);
    expect(vi.mocked(rm)).toHaveBeenCalledTimes(1);
    expect(await readFile(join(lockPath, 'holder.json'), 'utf8')).toBe(metadata);
  });

  it('removes an incomplete lock when writing holder metadata fails', async () => {
    const failure = Object.assign(new Error('disk full'), { code: 'ENOSPC' });
    vi.mocked(writeFile).mockRejectedValueOnce(failure);

    await expect(acquireProcessLock(lockPath)).rejects.toBe(failure);
    expect(await readdir(root)).toEqual([]);

    const release = await acquireProcessLock(lockPath, { retries: 0 });
    await release();
    expect(await readdir(root)).toEqual([]);
  });

  it('preserves the metadata error if incomplete-lock cleanup also fails', async () => {
    const failure = Object.assign(new Error('disk full'), { code: 'ENOSPC' });
    vi.mocked(writeFile).mockRejectedValueOnce(failure);
    vi.mocked(rm).mockRejectedValueOnce(new Error('cleanup denied'));

    await expect(acquireProcessLock(lockPath)).rejects.toBe(failure);
    expect(vi.mocked(rm)).toHaveBeenCalledTimes(1);
  });
});
