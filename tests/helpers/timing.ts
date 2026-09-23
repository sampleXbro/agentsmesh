import { performance } from 'node:perf_hooks';

/** Runs `fn` and returns its value with the elapsed wall time in ms. */
export function timed<T>(fn: () => T): { value: T; ms: number } {
  const start = performance.now();
  const value = fn();
  return { value, ms: performance.now() - start };
}
