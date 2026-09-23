/** Retry pacing for `acquireProcessLock`. */

export const DEFAULT_RETRY_DELAY_MS = 200;

export interface LockBackoffOptions {
  /** Delay before the first retry in ms (default 200). */
  retryDelayMs?: number;
  /** Cap for the doubling delay. Defaults to `retryDelayMs`, i.e. a fixed delay. */
  maxRetryDelayMs?: number;
  /** Spread each delay over the upper half of its window so waiters do not retry in step. */
  jitter?: boolean;
}

/** Delay before retry number `attempt` (1-based). */
export function lockRetryDelayMs(
  attempt: number,
  opts: Readonly<LockBackoffOptions>,
  random: () => number = Math.random,
): number {
  const base = opts.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const cap = Math.max(base, opts.maxRetryDelayMs ?? base);
  const delay = Math.min(cap, base * 2 ** (attempt - 1));
  return opts.jitter ? delay * (0.5 + random() * 0.5) : delay;
}
