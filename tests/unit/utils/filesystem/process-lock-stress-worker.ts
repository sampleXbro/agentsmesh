/**
 * Child process for process-lock-stress.test.ts, run from source via tsx.
 * argv: <lockPath> <counterPath> <cycles> <crash: 0|1>
 * Each cycle takes the lock, bumps the shared counter, and releases. With
 * crash=1 the last cycle bumps the counter and then dies holding the lock.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { acquireProcessLock } from '../../../../src/utils/filesystem/process-lock.js';

const [lockPath = '', counterPath = '', cyclesArg = '1', crashArg = '0'] = process.argv.slice(2);
const cycles = Number(cyclesArg);

for (let cycle = 1; cycle <= cycles; cycle++) {
  const release = await acquireProcessLock(lockPath, {
    retries: 20_000,
    retryDelayMs: 2,
    maxRetryDelayMs: 20,
    jitter: true,
    label: 'stress lock',
  });
  const count = Number(readFileSync(counterPath, 'utf-8'));
  // Widen the read-modify-write window so a second holder would lose an update.
  await sleep(2);
  writeFileSync(counterPath, String(count + 1));
  if (crashArg === '1' && cycle === cycles) process.kill(process.pid, 'SIGKILL');
  await release();
}
