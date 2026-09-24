import { describe, expect, it } from 'vitest';
import { createCallQueue } from '../../../src/mcp/call-queue.js';

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 5));

describe('createCallQueue', () => {
  it('runs tasks one at a time, in the order they came', async () => {
    const run = createCallQueue();
    const log: string[] = [];
    const task = (name: string) => async (): Promise<string> => {
      log.push(`start ${name}`);
      await tick();
      log.push(`end ${name}`);
      return name;
    };

    const results = await Promise.all([run(task('a')), run(task('b')), run(task('c'))]);

    expect(results).toEqual(['a', 'b', 'c']);
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
  });

  it('keeps going after a task fails, and passes the failure to its caller', async () => {
    const run = createCallQueue();

    const failed = run(async () => {
      throw new Error('boom');
    });
    const next = run(async () => 'next');

    await expect(failed).rejects.toThrow('boom');
    await expect(next).resolves.toBe('next');
  });
});
