import { describe, expect, it, vi } from 'vitest';
import { makeStdioBlocking } from '../../../src/cli/stdio-blocking.js';

interface FakeStream {
  _handle?: { setBlocking?: (blocking: boolean) => void };
}

describe('makeStdioBlocking', () => {
  it('puts both streams into blocking mode', () => {
    const out = vi.fn();
    const err = vi.fn();
    const streams: FakeStream[] = [
      { _handle: { setBlocking: out } },
      { _handle: { setBlocking: err } },
    ];

    makeStdioBlocking(streams as unknown as NodeJS.WriteStream[]);

    expect(out).toHaveBeenCalledWith(true);
    expect(err).toHaveBeenCalledWith(true);
  });

  it('is a no-op when the handle does not expose setBlocking', () => {
    const streams: FakeStream[] = [{}, { _handle: {} }];
    expect(() => makeStdioBlocking(streams as unknown as NodeJS.WriteStream[])).not.toThrow();
  });

  it('keeps going when one stream refuses', () => {
    const err = vi.fn();
    const streams: FakeStream[] = [
      {
        _handle: {
          setBlocking: () => {
            throw new Error('ENOTSUP');
          },
        },
      },
      { _handle: { setBlocking: err } },
    ];

    expect(() => makeStdioBlocking(streams as unknown as NodeJS.WriteStream[])).not.toThrow();
    expect(err).toHaveBeenCalledWith(true);
  });
});
