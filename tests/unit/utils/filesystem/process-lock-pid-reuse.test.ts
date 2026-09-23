import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireProcessLock } from '../../../../src/utils/filesystem/process-lock.js';
import { processIdentity } from '../../../../src/utils/filesystem/process-identity.js';
import { LockAcquisitionError } from '../../../../src/core/errors.js';

// Windows has no cheap start-time probe, so a reused pid there falls back to the age bound.
const probeable = process.platform !== 'win32';

let root = '';
let lockPath = '';

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-lock-pid-reuse-'));
  lockPath = join(root, '.generate.lock');
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

function writeHolder(procStart: string | null): void {
  mkdirSync(lockPath);
  const holder = {
    pid: process.pid,
    started: Date.now() - 10_000,
    hostname: hostname(),
    ...(procStart === null ? {} : { procStart }),
  };
  writeFileSync(join(lockPath, 'holder.json'), JSON.stringify(holder));
}

describe.skipIf(!probeable)('acquireProcessLock — reused pid', () => {
  it('records the holder process start identity next to its pid', async () => {
    const release = await acquireProcessLock(lockPath);
    try {
      const holder = JSON.parse(readFileSync(join(lockPath, 'holder.json'), 'utf-8')) as {
        pid: number;
        procStart?: string;
      };
      expect(holder.pid).toBe(process.pid);
      expect(holder.procStart).toBe(await processIdentity(process.pid));
    } finally {
      await release();
    }
  });

  it('evicts a lock whose live pid now belongs to a different process', async () => {
    writeHolder('Thu Jan  1 00:00:00 1970');
    const release = await acquireProcessLock(lockPath, { retries: 0 });
    const holder = JSON.parse(readFileSync(join(lockPath, 'holder.json'), 'utf-8')) as {
      procStart?: string;
    };
    expect(holder.procStart).toBe(await processIdentity(process.pid));
    await release();
  });

  it('keeps a lock whose pid still belongs to the process that took it', async () => {
    writeHolder(await processIdentity(process.pid));
    await expect(acquireProcessLock(lockPath, { retries: 0 })).rejects.toBeInstanceOf(
      LockAcquisitionError,
    );
  });

  it('keeps a live-pid lock that predates start-time records', async () => {
    writeHolder(null);
    await expect(acquireProcessLock(lockPath, { retries: 0 })).rejects.toBeInstanceOf(
      LockAcquisitionError,
    );
  });
});
