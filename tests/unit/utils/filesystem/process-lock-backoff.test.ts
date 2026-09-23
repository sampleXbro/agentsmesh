import { describe, expect, it } from 'vitest';
import { lockRetryDelayMs } from '../../../../src/utils/filesystem/process-lock-backoff.js';

describe('lockRetryDelayMs', () => {
  it('keeps the fixed 200ms delay when no backoff options are given', () => {
    expect([1, 2, 10, 30].map((n) => lockRetryDelayMs(n, {}))).toEqual([200, 200, 200, 200]);
  });

  it('keeps a fixed delay when only retryDelayMs is set (install/generate behaviour)', () => {
    expect([1, 5, 30].map((n) => lockRetryDelayMs(n, { retryDelayMs: 50 }))).toEqual([50, 50, 50]);
  });

  it('doubles from the base up to maxRetryDelayMs', () => {
    const opts = { retryDelayMs: 25, maxRetryDelayMs: 250 };
    expect([1, 2, 3, 4, 5, 6, 400].map((n) => lockRetryDelayMs(n, opts))).toEqual([
      25, 50, 100, 200, 250, 250, 250,
    ]);
  });

  it('never goes below the base when the cap is smaller than the base', () => {
    expect(lockRetryDelayMs(3, { retryDelayMs: 40, maxRetryDelayMs: 10 })).toBe(40);
  });

  it('jitters each delay into the upper half of its window', () => {
    const opts = { retryDelayMs: 100, maxRetryDelayMs: 100, jitter: true };
    expect(lockRetryDelayMs(1, opts, () => 0)).toBe(50);
    expect(lockRetryDelayMs(1, opts, () => 0.5)).toBe(75);
    expect(lockRetryDelayMs(1, opts, () => 0.999)).toBeCloseTo(99.95);
  });

  it('ignores the random source when jitter is off', () => {
    expect(lockRetryDelayMs(1, { retryDelayMs: 100 }, () => 0)).toBe(100);
  });
});
