/**
 * Windows fails a filesystem call for a moment with EPERM, EACCES or EBUSY
 * while another process has the same path open or is removing it. The retry
 * helper waits that out, stops at once on any other error, and gives up after
 * five attempts so a real permission problem still surfaces.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  isTransientFsError,
  retryTransient,
  retryTransientSync,
} from '../../../../src/utils/filesystem/transient-fs.js';

const fail = (code: string): Error => Object.assign(new Error(code), { code });

describe('isTransientFsError', () => {
  it.each(['EPERM', 'EACCES', 'EBUSY'])('is true for %s', (code) => {
    expect(isTransientFsError(fail(code))).toBe(true);
  });

  it.each([fail('ENOENT'), fail('EEXIST'), new Error('plain'), null, 'EPERM'])(
    'is false for %j',
    (err) => {
      expect(isTransientFsError(err)).toBe(false);
    },
  );
});

describe('retryTransient', () => {
  it('returns once a transient error clears', async () => {
    const op = vi.fn<() => Promise<string>>();
    op.mockRejectedValueOnce(fail('EPERM')).mockRejectedValueOnce(fail('EBUSY'));
    op.mockResolvedValue('done');

    await expect(retryTransient(op)).resolves.toBe('done');
    expect(op).toHaveBeenCalledTimes(3);
  });

  it('throws any other error at once, and a lasting one after 5 attempts', async () => {
    const other = vi.fn<() => Promise<void>>().mockRejectedValue(fail('ENOENT'));
    await expect(retryTransient(other)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(other).toHaveBeenCalledTimes(1);

    const lasting = vi.fn<() => Promise<void>>().mockRejectedValue(fail('EACCES'));
    await expect(retryTransient(lasting)).rejects.toMatchObject({ code: 'EACCES' });
    expect(lasting).toHaveBeenCalledTimes(5);
  });
});

describe('retryTransientSync', () => {
  it('returns once a transient error clears', () => {
    let calls = 0;
    const op = (): string => {
      calls += 1;
      if (calls < 3) throw fail('EPERM');
      return 'done';
    };

    expect([retryTransientSync(op), calls]).toEqual(['done', 3]);
  });

  it('throws any other error at once, and a lasting one after 5 attempts', () => {
    let calls = 0;
    const other = (): never => {
      calls += 1;
      throw fail('ENOENT');
    };
    expect(() => retryTransientSync(other)).toThrow('ENOENT');
    expect(calls).toBe(1);

    calls = 0;
    const lasting = (): never => {
      calls += 1;
      throw fail('EBUSY');
    };
    expect(() => retryTransientSync(lasting)).toThrow('EBUSY');
    expect(calls).toBe(5);
  });
});
