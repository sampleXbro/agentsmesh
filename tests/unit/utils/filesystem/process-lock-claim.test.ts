/**
 * Claim races inside `acquireProcessLock`: another process lands in the lock
 * dir, or evicts it, while this process is still writing its claim. Each race
 * is injected at a fixed filesystem call.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { acquireProcessLock } from '../../../../src/utils/filesystem/process-lock.js';
import { ownerPath } from '../../../../src/utils/filesystem/process-lock-state.js';
import { LockAcquisitionError } from '../../../../src/core/errors.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, mkdir: vi.fn(actual.mkdir), writeFile: vi.fn(actual.writeFile) };
});

const real = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');

let root = '';
let lockPath = '';

beforeEach(() => {
  vi.mocked(mkdir).mockReset().mockImplementation(real.mkdir);
  vi.mocked(writeFile).mockReset().mockImplementation(real.writeFile);
  root = mkdtempSync(join(tmpdir(), 'am-lock-claim-'));
  lockPath = join(root, '.generate.lock');
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

const foreignHolder = JSON.stringify({ pid: process.pid, started: Date.now(), token: 'foreign' });

/** Runs `race` once, just before this process creates its owner marker. */
function beforeOwnMarker(race: () => void): void {
  let armed = true;
  vi.mocked(mkdir).mockImplementation((async (path: string, options?: unknown) => {
    if (armed && basename(String(path)).startsWith('owner-')) {
      armed = false;
      race();
    }
    return real.mkdir(path, options as Parameters<typeof real.mkdir>[1]);
  }) as typeof mkdir);
}

/** Runs `race` once around this process's holder.json write. */
function aroundHolderWrite(race: (data: string) => void, after: boolean): void {
  let armed = true;
  vi.mocked(writeFile).mockImplementation((async (path: string, data: string, options: unknown) => {
    const hit = armed && String(path).endsWith('holder.json');
    if (hit) armed = false;
    if (hit && !after) race(data);
    await real.writeFile(path, data, options as Parameters<typeof real.writeFile>[2]);
    if (hit && after) race(data);
  }) as typeof writeFile);
}

describe('acquireProcessLock — claim races', () => {
  it('backs off when a second owner lands in the dir it just claimed', async () => {
    beforeOwnMarker(() => mkdirSync(ownerPath(lockPath, 'foreign')));
    const err = await acquireProcessLock(lockPath, { retries: 0 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LockAcquisitionError);
    expect(readdirSync(lockPath)).toEqual(['owner-foreign']);
  });

  it('never overwrites holder metadata another owner already wrote', async () => {
    aroundHolderWrite(() => writeFileSync(join(lockPath, 'holder.json'), foreignHolder), false);
    const err = await acquireProcessLock(lockPath, { retries: 0 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LockAcquisitionError);
    expect(readdirSync(lockPath)).toEqual(['holder.json']);
    expect(readFileSync(join(lockPath, 'holder.json'), 'utf-8')).toBe(foreignHolder);
  });

  it('retries when its claim dir vanishes before the owner marker lands', async () => {
    beforeOwnMarker(() => rmSync(lockPath, { recursive: true, force: true }));
    const release = await acquireProcessLock(lockPath, { retries: 0 });
    expect(existsSync(join(lockPath, 'holder.json'))).toBe(true);
    await release();
    expect(readdirSync(root)).toEqual([]);
  });

  it('gives up a claim whose owner marker was evicted mid-write, then claims again', async () => {
    aroundHolderWrite((data) => {
      const { token } = JSON.parse(data) as { token: string };
      rmSync(ownerPath(lockPath, token), { recursive: true });
    }, true);
    const release = await acquireProcessLock(lockPath, { retries: 0 });
    expect(vi.mocked(writeFile)).toHaveBeenCalledTimes(2);
    const holder = JSON.parse(readFileSync(join(lockPath, 'holder.json'), 'utf-8')) as {
      token: string;
    };
    expect(readdirSync(lockPath).sort()).toEqual(['holder.json', `owner-${holder.token}`]);
    await release();
    expect(readdirSync(root)).toEqual([]);
  });

  it('evicts an aged claim that crashed between its owner marker and holder.json', async () => {
    mkdirSync(ownerPath(lockPath, 'crashed'), { recursive: true });
    const aged = new Date(Date.now() - 10_000);
    utimesSync(lockPath, aged, aged);
    const release = await acquireProcessLock(lockPath, { retries: 0 });
    expect(existsSync(ownerPath(lockPath, 'crashed'))).toBe(false);
    await release();
    expect(readdirSync(root)).toEqual([]);
  });

  it('keeps a young claim that has its owner marker but no holder.json yet', async () => {
    mkdirSync(ownerPath(lockPath, 'starting'), { recursive: true });
    const err = await acquireProcessLock(lockPath, { retries: 0 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LockAcquisitionError);
    expect(readdirSync(lockPath)).toEqual(['owner-starting']);
  });

  it('leaves no aside copy behind after evicting an old-format stale lock', async () => {
    mkdirSync(lockPath);
    const stale = { pid: 0, started: Date.now(), hostname: hostname() };
    writeFileSync(join(lockPath, 'holder.json'), JSON.stringify(stale));
    const release = await acquireProcessLock(lockPath, { retries: 0 });
    expect(readdirSync(root)).toEqual(['.generate.lock']);
    await release();
    expect(readdirSync(root)).toEqual([]);
  });
});
