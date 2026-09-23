import { readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { lessonsPaths } from './paths.js';

/**
 * A crashed writer can leave a temp file (`<name>.<pid>.tmp`) or a lock folder
 * set aside for inspection (`<lock>.<id>.stale`) in `.agentsmesh/lessons/`.
 * Nothing else removes them, so every graph write sweeps the old ones.
 */
const LEFTOVER = /\.(?:\d+\.tmp|[\w-]+\.stale)$/;

/** Younger entries may belong to a writer that is still running. */
const LEFTOVER_AGE_MS = 60_000;

export function sweepLessonsLeftovers(projectRoot: string, now: number = Date.now()): void {
  const dir = lessonsPaths(projectRoot).base;
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    if (!LEFTOVER.test(name)) continue;
    const path = join(dir, name);
    try {
      if (now - statSync(path).mtimeMs > LEFTOVER_AGE_MS)
        rmSync(path, { recursive: true, force: true });
    } catch {
      // Best-effort housekeeping: never fail a write over a leftover.
    }
  }
}
