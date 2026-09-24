/**
 * Cross-process stress for `acquireProcessLock`, run from source via tsx.
 *
 * Short-lived workers race for one lock around a read-modify-write of a shared
 * counter. Some workers die holding the lock, so every waiter judges the same
 * dead holder stale at once — the exact race where a blind delete lets two
 * processes hold the lock. Any double hold shows up as a lost increment.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { acquireProcessLock } from '../../../../src/utils/filesystem/process-lock.js';
import { resolveNodeBin } from '../../../helpers/node-bin.js';

const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const TSX = resolveNodeBin(REPO_ROOT, 'tsx');
const WORKER = fileURLToPath(new URL('./process-lock-stress-worker.ts', import.meta.url));

const WORKERS = 12;
const CYCLES = 4;
const CRASHERS = new Set([2, 5, 8, 11]);

interface WorkerExit {
  code: number | null;
  signal: NodeJS.Signals | null;
  stderr: string;
}

let root = '';

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-lock-stress-'));
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

function runWorker(lockPath: string, counterPath: string, crash: boolean): Promise<WorkerExit> {
  return new Promise((resolve, reject) => {
    const args = [WORKER, lockPath, counterPath, String(CYCLES), crash ? '1' : '0'];
    // `tsx` is `tsx.cmd` on Windows, which Node only spawns through a shell.
    const child = spawn(TSX, args, { shell: process.platform === 'win32' });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8');
    });
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({ code, signal, stderr }));
  });
}

describe('acquireProcessLock — cross-process stress', () => {
  it('loses no increment while workers contend and some die holding the lock', async () => {
    const lockPath = join(root, '.stress.lock');
    const counterPath = join(root, 'counter');
    writeFileSync(counterPath, '0');

    const exits = await Promise.all(
      Array.from({ length: WORKERS }, (_, i) => runWorker(lockPath, counterPath, CRASHERS.has(i))),
    );

    exits.forEach((exit, i) => {
      if (CRASHERS.has(i)) expect(exit.signal ?? exit.code, exit.stderr).not.toBe(0);
      else expect(exit.code, exit.stderr).toBe(0);
    });
    expect(Number(readFileSync(counterPath, 'utf-8'))).toBe(WORKERS * CYCLES);
    // A crasher that ran last leaves a dead lock: one more acquire must clear it.
    const release = await acquireProcessLock(lockPath, { retries: 0 });
    await release();
    expect(readdirSync(root)).toEqual(['counter']);
  }, 60_000);
});
