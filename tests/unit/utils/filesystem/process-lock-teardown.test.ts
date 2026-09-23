/**
 * Teardown races: after a process gives up an owner marker (release, eviction,
 * or a lost claim) it stalls, and the lock passes to another holder before the
 * leftover holder.json is removed. The stale remover must leave the new
 * holder's files alone.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { rmdir, writeFile } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { acquireProcessLock } from '../../../../src/utils/filesystem/process-lock.js';
import { ownerPath } from '../../../../src/utils/filesystem/process-lock-state.js';
import { LockAcquisitionError } from '../../../../src/core/errors.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, rmdir: vi.fn(actual.rmdir), writeFile: vi.fn(actual.writeFile) };
});

const real = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');

let root = '';
let lockPath = '';
let other = '';

beforeEach(() => {
  vi.mocked(rmdir).mockReset().mockImplementation(real.rmdir);
  vi.mocked(writeFile).mockReset().mockImplementation(real.writeFile);
  root = mkdtempSync(join(tmpdir(), 'am-lock-teardown-'));
  lockPath = join(root, '.generate.lock');
  other = JSON.stringify({
    pid: process.pid,
    started: Date.now(),
    hostname: hostname(),
    token: 'o',
  });
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

/** Another live process now holds the lock. */
function otherTakesOver(): void {
  rmSync(lockPath, { recursive: true, force: true });
  mkdirSync(ownerPath(lockPath, 'o'), { recursive: true });
  writeFileSync(join(lockPath, 'holder.json'), other);
}

function expectOtherHolds(): void {
  expect(readdirSync(lockPath).sort()).toEqual(['holder.json', 'owner-o']);
  expect(readFileSync(join(lockPath, 'holder.json'), 'utf-8')).toBe(other);
}

/** Runs `race` once, right after an owner marker is removed. */
function afterMarkerRemoved(race: () => void): void {
  let armed = true;
  vi.mocked(rmdir).mockImplementation((async (path: string) => {
    await real.rmdir(path);
    if (armed && basename(String(path)).startsWith('owner-')) {
      armed = false;
      race();
    }
  }) as typeof rmdir);
}

describe('acquireProcessLock — teardown after the lock changed hands', () => {
  it('a release that stalls after dropping its marker keeps the next holder files', async () => {
    const release = await acquireProcessLock(lockPath);
    afterMarkerRemoved(otherTakesOver);
    await release();
    expectOtherHolds();
  });

  it('an eviction that stalls after dropping the dead marker keeps the next holder files', async () => {
    mkdirSync(ownerPath(lockPath, 'dead'), { recursive: true });
    const dead = { pid: 0, started: Date.now(), hostname: hostname(), token: 'dead' };
    writeFileSync(join(lockPath, 'holder.json'), JSON.stringify(dead));
    afterMarkerRemoved(otherTakesOver);

    const err = await acquireProcessLock(lockPath, { retries: 0 }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(LockAcquisitionError);
    expectOtherHolds();
  });

  it('a claim that lost its marker mid-write keeps the next holder files', async () => {
    let armed = true;
    vi.mocked(writeFile).mockImplementation((async (path: string, ...rest: unknown[]) => {
      await real.writeFile(path, ...(rest as [string, { flag: string }]));
      if (armed && String(path).endsWith('holder.json')) {
        armed = false;
        otherTakesOver();
      }
    }) as typeof writeFile);

    const err = await acquireProcessLock(lockPath, { retries: 0 }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(LockAcquisitionError);
    expectOtherHolds();
  });
});
