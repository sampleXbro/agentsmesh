import { setTimeout as sleep } from 'node:timers/promises';

/**
 * Windows fails a filesystem call with these for a short time while another
 * process has the same path open or is removing it ("delete pending").
 */
const TRANSIENT_CODES: ReadonlySet<string> = new Set(['EPERM', 'EACCES', 'EBUSY']);
const ATTEMPTS = 5;
const BASE_DELAY_MS = 25;
const pause = new Int32Array(new SharedArrayBuffer(4));

export function isTransientFsError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | null)?.code;
  return typeof code === 'string' && TRANSIENT_CODES.has(code);
}

/** Runs `op`, retrying a transient error with a short backoff; a lasting one still throws. */
export async function retryTransient<T>(op: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await op();
    } catch (err) {
      if (!isTransientFsError(err) || attempt >= ATTEMPTS) throw err;
      await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }
}

/** Sync `retryTransient`, for code that must not become async. */
export function retryTransientSync<T>(op: () => T): T {
  for (let attempt = 1; ; attempt++) {
    try {
      return op();
    } catch (err) {
      if (!isTransientFsError(err) || attempt >= ATTEMPTS) throw err;
      Atomics.wait(pause, 0, 0, BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }
}
