/**
 * `isHeld()` on the release function tells a holder whether it still owns the
 * lock, so a holder paused past `staleMs` (and evicted) can refuse to write.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireProcessLock } from '../../../../src/utils/filesystem/process-lock.js';

const realKill = process.kill.bind(process);

let root = '';
let lockPath = '';

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-lock-is-held-'));
  lockPath = join(root, '.lessons.lock');
});

afterEach(() => {
  vi.restoreAllMocks();
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

describe('acquireProcessLock — isHeld', () => {
  it('is true while held and false after release', async () => {
    const release = await acquireProcessLock(lockPath);
    expect(await release.isHeld()).toBe(true);
    await release();
    expect(await release.isHeld()).toBe(false);
  });

  it('is false for a holder another process evicted, and true for the new holder', async () => {
    const releaseOld = await acquireProcessLock(lockPath);
    nextProbeSaysDead();
    const releaseNew = await acquireProcessLock(lockPath, { retries: 0 });

    expect(await releaseOld.isHeld()).toBe(false);
    expect(await releaseNew.isHeld()).toBe(true);

    await releaseOld();
    expect(await releaseNew.isHeld()).toBe(true);
    await releaseNew();
  });
});
