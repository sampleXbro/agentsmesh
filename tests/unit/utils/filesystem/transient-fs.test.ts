/**
 * Windows fails a filesystem call for a moment with EPERM, EACCES or EBUSY
 * while another process has the same path open or is removing it. The retry
 * helpers wait that out, stop at once on any other error, and give up after
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

  it('throws any other error at once', async () => {
    const op = vi.fn<() => Promise<void>>().mockRejectedValue(fail('ENOENT'));

    await expect(retryTransient(op)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('throws a transient error that does not clear after 5 attempts', async () => {
    const op = vi.fn<() => Promise<void>>().mockRejectedValue(fail('EACCES'));

    await expect(retryTransient(op)).rejects.toMatchObject({ code: 'EACCES' });
    expect(op).toHaveBeenCalledTimes(5);
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
