/**
 * The recall hook must never break its host: whatever goes wrong inside it
 * (an unexpected throw, a failing stdin), `lessons hook` prints nothing and
 * exits 0.
 */

import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';

const build = vi.hoisted(() => vi.fn());
vi.mock('../../../../src/lessons/hook.js', () => ({ buildRecallHookOutput: build }));

import { doHook } from '../../../../src/cli/commands/lessons-handlers.js';

const realStdin = Object.getOwnPropertyDescriptor(process, 'stdin');
afterEach(() => {
  if (realStdin !== undefined) Object.defineProperty(process, 'stdin', realStdin);
  build.mockReset();
});

function setStdin(stream: Readable): void {
  Object.defineProperty(process, 'stdin', { configurable: true, value: stream });
}

describe('doHook safety net', () => {
  it('returns empty output and exit 0 when recall throws', async () => {
    setStdin(Readable.from([Buffer.from('{"hook_event_name":"PreToolUse"}')]));
    build.mockRejectedValue(new Error("EACCES: permission denied, open 'outcome-log.jsonl'"));
    const r = await doHook('/nowhere');
    expect(r).toEqual({ subcommand: 'hook', exitCode: 0, data: { output: '' } });
  });

  it('returns empty output and exit 0 when stdin fails', async () => {
    const failing = new Readable({
      read(): void {
        this.destroy(new Error('EIO'));
      },
    });
    setStdin(failing);
    const r = await doHook('/nowhere');
    expect(r).toEqual({ subcommand: 'hook', exitCode: 0, data: { output: '' } });
    expect(build).not.toHaveBeenCalled();
  });

  it('passes the recall output and exit code through', async () => {
    setStdin(Readable.from([Buffer.from('{}')]));
    build.mockResolvedValue({ output: '{"x":1}', exitCode: 2 });
    const r = await doHook('/nowhere');
    expect(r).toEqual({ subcommand: 'hook', exitCode: 2, data: { output: '{"x":1}' } });
  });
});
