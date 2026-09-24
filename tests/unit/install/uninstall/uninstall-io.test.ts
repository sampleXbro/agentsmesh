import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  defaultUninstallAdapter,
  parseUninstallNames,
} from '../../../../src/install/uninstall/uninstall-io.js';

const realStdin = Object.getOwnPropertyDescriptor(process, 'stdin');
afterEach(() => {
  if (realStdin !== undefined) Object.defineProperty(process, 'stdin', realStdin);
  vi.restoreAllMocks();
});

describe('uninstall io', () => {
  it('splits comma and space separated names and keeps duplicates', () => {
    expect(parseUninstallNames(['a,b', ' c ', 'a'])).toEqual(['a', 'b', 'c', 'a']);
  });

  it('the default adapter reads an answer from stdin and writes through the logger', async () => {
    Object.defineProperty(process, 'stdin', {
      configurable: true,
      value: Readable.from([Buffer.from('yes\n')]),
    });
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const adapter = defaultUninstallAdapter();

    const answer = await adapter.ask('Remove? ');
    adapter.write('notice\n');

    expect(answer).toBe('yes');
    expect(out.mock.calls.map(([chunk]) => String(chunk))).toEqual(['Remove? ', 'notice\n']);
  });
});
