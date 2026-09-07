import { afterEach, expect, it } from 'vitest';
import { join } from 'node:path';
import { rm, writeFile } from 'node:fs/promises';
import {
  createWatchTestDir,
  delay,
  runWatch,
  WATCH_TEST_OPTS,
  watchStabilityDelayMs,
  writeMinimalWatchProject,
} from '../../../harness/watch.js';

const dir = createWatchTestDir();
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

it('ignores unique atomic lock temporary files after startup', async () => {
  writeMinimalWatchProject(dir);
  let cycles = 0;
  const watcher = await runWatch({}, dir, {
    ...WATCH_TEST_OPTS,
    onCycle: () => {
      cycles += 1;
    },
  });
  try {
    expect(cycles).toBe(1);
    const temp = join(dir, '.agentsmesh', '.lock.tmp-11111111-1111-4111-8111-111111111111');
    await writeFile(temp, 'pending lock');
    await delay(watchStabilityDelayMs());
    expect(cycles).toBe(1);
    await rm(temp);
    await delay(watchStabilityDelayMs());
    expect(cycles).toBe(1);
  } finally {
    await watcher.stop();
  }
});
