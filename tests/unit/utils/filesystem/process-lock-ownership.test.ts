/**
 * Ownership interleavings for `acquireProcessLock`, injected at fixed points
 * (the waiter's read of holder.json, its stat, or its liveness probe) — no timing luck.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  acquireProcessLock,
  type LockRelease,
} from '../../../../src/utils/filesystem/process-lock.js';
import { LockAcquisitionError } from '../../../../src/core/errors.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, readFile: vi.fn(actual.readFile), stat: vi.fn(actual.stat) };
});

const real = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
const realKill = process.kill.bind(process);

let root = '';
let lockPath = '';
const leaked: LockRelease[] = [];

beforeEach(() => {
  vi.mocked(readFile).mockReset().mockImplementation(real.readFile);
  vi.mocked(stat).mockReset().mockImplementation(real.stat);
  root = mkdtempSync(join(tmpdir(), 'am-lock-ownership-'));
  lockPath = join(root, '.generate.lock');
});

afterEach(async () => {
  vi.restoreAllMocks();
  for (const release of leaked.splice(0)) await release();
  rmSync(root, { recursive: true, force: true });
});

/** The next liveness probe (`kill(pid, 0)`) reports the process as gone. */
function nextProbeSaysDead(): void {
  let armed = true;
  vi.spyOn(process, 'kill').mockImplementation((pid: number, signal?: string | number) => {
    if (armed && signal === 0) {
      armed = false;
      throw Object.assign(new Error('kill ESRCH'), { code: 'ESRCH' });
    }
    return realKill(pid, signal);
  });
}

/** Runs `between` right after the next read of holder.json, then returns what was read. */
function onNextHolderRead(between: () => Promise<void>, thenThrowEnoent = false): void {
  let armed = true;
  vi.mocked(readFile).mockImplementation((async (path: string, options: 'utf-8') => {
    if (!armed || !String(path).endsWith('holder.json')) return real.readFile(path, options);
    armed = false;
    const content = await real.readFile(path, options);
    await between();
    if (thenThrowEnoent) throw Object.assign(new Error('read ENOENT'), { code: 'ENOENT' });
    return content;
  }) as typeof readFile);
}

/** Runs `between` at the next stat of the lock dir, then reports the dir as gone. */
function onNextLockStatGone(between: () => Promise<void>): void {
  let armed = true;
  vi.mocked(stat).mockImplementation((async (path: string) => {
    if (!armed || String(path) !== lockPath) return real.stat(path);
    armed = false;
    await between();
    throw Object.assign(new Error('stat ENOENT'), { code: 'ENOENT' });
  }) as typeof stat);
}

/** A lock as written before owner tokens existed: holder.json only. */
function writeOldFormatHolder(holder: { pid: number; started: number }): void {
  mkdirSync(lockPath);
  writeFileSync(join(lockPath, 'holder.json'), JSON.stringify({ ...holder, hostname: hostname() }));
}

/** Acquire outcome that never leaks a lock: an unexpected success is recorded for cleanup. */
async function attempt(opts: { retries: number }): Promise<unknown> {
  return acquireProcessLock(lockPath, { ...opts, retryDelayMs: 5 }).then(
    (release) => {
      leaked.push(release);
      return 'acquired';
    },
    (error: unknown) => error,
  );
}

describe('acquireProcessLock — ownership under interleaving', () => {
  it('a waiter that judged the old holder stale never deletes the newer holder lock', async () => {
    const releaseOld = await acquireProcessLock(lockPath);
    let releaseNew: LockRelease | undefined;
    let newHolder = '';
    onNextHolderRead(async () => {
      await releaseOld();
      releaseNew = await acquireProcessLock(lockPath, { retries: 0 });
      newHolder = readFileSync(join(lockPath, 'holder.json'), 'utf-8');
    });
    nextProbeSaysDead();

    const outcome = await attempt({ retries: 2 });

    expect(outcome).toBeInstanceOf(LockAcquisitionError);
    expect(releaseNew).toBeDefined();
    expect(readFileSync(join(lockPath, 'holder.json'), 'utf-8')).toBe(newHolder);
    await releaseNew?.();
    expect(existsSync(lockPath)).toBe(false);
  });

  it('a waiter that saw the lock vanish retries instead of deleting the next holder lock', async () => {
    const releaseOld = await acquireProcessLock(lockPath);
    let releaseNew: LockRelease | undefined;
    onNextHolderRead(() => releaseOld(), true);
    onNextLockStatGone(async () => {
      releaseNew = await acquireProcessLock(lockPath, { retries: 0 });
    });

    const outcome = await attempt({ retries: 2 });

    expect(outcome).toBeInstanceOf(LockAcquisitionError);
    expect(releaseNew).toBeDefined();
    expect(existsSync(join(lockPath, 'holder.json'))).toBe(true);
    await releaseNew?.();
    expect(existsSync(lockPath)).toBe(false);
  });

  it('release by a holder whose lock was taken over leaves the new holder lock in place', async () => {
    const releaseOld = await acquireProcessLock(lockPath);
    nextProbeSaysDead();
    const releaseNew = await acquireProcessLock(lockPath, { retries: 0 });
    const newHolder = readFileSync(join(lockPath, 'holder.json'), 'utf-8');

    await releaseOld();

    expect(readFileSync(join(lockPath, 'holder.json'), 'utf-8')).toBe(newHolder);
    expect(await attempt({ retries: 0 })).toBeInstanceOf(LockAcquisitionError);
    await releaseNew();
    expect(existsSync(lockPath)).toBe(false);
  });

  it('a stale old-format lock that changed after it was judged is put back, not deleted', async () => {
    writeOldFormatHolder({ pid: 0, started: Date.now() });
    const fresh = JSON.stringify({ pid: process.pid, started: Date.now(), hostname: hostname() });
    onNextHolderRead(async () => writeFileSync(join(lockPath, 'holder.json'), fresh));

    expect(await attempt({ retries: 0 })).toBeInstanceOf(LockAcquisitionError);
    expect(readFileSync(join(lockPath, 'holder.json'), 'utf-8')).toBe(fresh);
    expect(readdirSync(root)).toEqual(['.generate.lock']);
  });

  it('a stale old-format lock that vanished before eviction is simply retried', async () => {
    writeOldFormatHolder({ pid: 0, started: Date.now() });
    onNextHolderRead(async () => rmSync(lockPath, { recursive: true }));

    expect(await attempt({ retries: 0 })).toBe('acquired');
  });

  it('signal cleanup of a holder whose lock was taken over leaves the new lock alone', async () => {
    await acquireProcessLock(lockPath);
    // Another process evicts this holder and takes the lock.
    rmSync(lockPath, { recursive: true });
    mkdirSync(join(lockPath, 'owner-other'), { recursive: true });
    const other = JSON.stringify({ pid: process.pid, started: Date.now(), token: 'other' });
    writeFileSync(join(lockPath, 'holder.json'), other);

    const kill = vi.spyOn(process, 'kill').mockReturnValue(true);
    process.emit('SIGINT', 'SIGINT');
    expect(kill).toHaveBeenCalledWith(process.pid, 'SIGINT');
    expect(readdirSync(lockPath).sort()).toEqual(['holder.json', 'owner-other']);
    expect(readFileSync(join(lockPath, 'holder.json'), 'utf-8')).toBe(other);
  });

  it('a second release after a takeover is still a no-op', async () => {
    const releaseOld = await acquireProcessLock(lockPath);
    nextProbeSaysDead();
    const releaseNew = await acquireProcessLock(lockPath, { retries: 0 });
    await releaseOld();
    await releaseOld();
    expect(existsSync(join(lockPath, 'holder.json'))).toBe(true);
    await releaseNew();
    expect(existsSync(lockPath)).toBe(false);
  });
});
