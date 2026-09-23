import { afterEach, describe, expect, it } from 'vitest';
import {
  doHook,
  MAX_HOOK_STDIN_BYTES,
  readBoundedStream,
} from '../../../../src/cli/commands/lessons-handlers.js';

async function* chunks(...parts: string[]): AsyncIterable<Buffer> {
  for (const p of parts) yield Buffer.from(p, 'utf8');
}

describe('readBoundedStream', () => {
  it('concatenates chunks under the cap into one UTF-8 string', async () => {
    expect(await readBoundedStream(chunks('{"a":', '1}'))).toBe('{"a":1}');
  });

  it('returns "" past the byte cap but keeps reading to the end, so the sender gets no broken pipe', async () => {
    let pulled = 0;
    async function* counted(): AsyncIterable<Buffer> {
      for (const p of ['aaaa', 'bbbb', 'cccc', 'dddd']) {
        pulled += 1;
        yield Buffer.from(p, 'utf8');
      }
    }
    expect(await readBoundedStream(counted(), 6)).toBe('');
    expect(pulled).toBe(4);
  });

  it('uses a 1 MB default cap', () => {
    expect(MAX_HOOK_STDIN_BYTES).toBe(1_000_000);
  });
});

describe('doHook', () => {
  const original = process.stdin.isTTY;
  afterEach(() => {
    process.stdin.isTTY = original;
  });

  it('emits nothing when stdin is an interactive TTY (no piped payload)', async () => {
    process.stdin.isTTY = true;
    const r = await doHook(process.cwd());
    expect(r.subcommand).toBe('hook');
    if (r.subcommand !== 'hook') return;
    expect(r.data.output).toBe('');
    expect(r.exitCode).toBe(0);
  });
});
