/**
 * A holder start time (or lock dir mtime) far in the future cannot belong to a
 * holder that is really running: without a bound it would never age past
 * `staleMs`, and every waiter would give up with a negative running time.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireProcessLock } from '../../../../src/utils/filesystem/process-lock.js';
import { describeHolder } from '../../../../src/utils/filesystem/process-lock-state.js';
import { LockAcquisitionError } from '../../../../src/core/errors.js';

const HOUR_MS = 60 * 60 * 1000;

let root = '';
let lockPath = '';

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-lock-skew-'));
  lockPath = join(root, '.lessons.lock');
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

function writeHeldLock(holder: { pid: number; started: number; hostname: string }): void {
  mkdirSync(join(lockPath, 'owner-t1'), { recursive: true });
  writeFileSync(join(lockPath, 'holder.json'), JSON.stringify({ ...holder, token: 't1' }));
}

function holderToken(): string | undefined {
  const raw = readFileSync(join(lockPath, 'holder.json'), 'utf-8');
  return (JSON.parse(raw) as { token?: string }).token;
}

describe('acquireProcessLock — holder start time in the future', () => {
  it('evicts an other-host holder that claims to start an hour from now', async () => {
    writeHeldLock({ pid: 12345, started: Date.now() + HOUR_MS, hostname: 'otherhost.example' });

    const release = await acquireProcessLock(lockPath, { retries: 0, staleMs: 60_000 });

    expect(holderToken()).not.toBe('t1');
    await release();
  });

  it('evicts a live same-host holder whose start time is an hour ahead', async () => {
    writeHeldLock({ pid: process.pid, started: Date.now() + HOUR_MS, hostname: hostname() });

    const release = await acquireProcessLock(lockPath, { retries: 0, staleMs: 60_000 });

    expect(holderToken()).not.toBe('t1');
    await release();
  });

  it('keeps a holder only slightly ahead (clock skew) and never reports a negative running time', async () => {
    writeHeldLock({ pid: 12345, started: Date.now() + 30_000, hostname: 'otherhost.example' });

    const err = await acquireProcessLock(lockPath, { retries: 0, staleMs: 60_000 }).catch(
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(LockAcquisitionError);
    expect((err as Error).message).toContain('otherhost.example:pid 12345 (running 0ms)');
    expect(holderToken()).toBe('t1');
  });

  it('evicts an ownerless lock dir whose mtime is far in the future', async () => {
    mkdirSync(lockPath);
    const future = new Date(Date.now() + HOUR_MS);
    utimesSync(lockPath, future, future);

    const release = await acquireProcessLock(lockPath, { retries: 0 });

    expect(holderToken()).toBeDefined();
    await release();
  });
});

describe('describeHolder', () => {
  it('clamps a future start time to a zero running time', () => {
    const meta = { pid: 7, started: Date.now() + HOUR_MS, hostname: 'h', token: 't' };
    expect(describeHolder({ kind: 'held', token: 't', meta })).toBe('h:pid 7 (running 0ms)');
  });
});
