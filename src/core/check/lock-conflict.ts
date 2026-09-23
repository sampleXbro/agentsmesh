import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hasConflictMarkers } from '../../lessons/conflict-markers.js';

/**
 * True when `canonicalDir/.lock` has git conflict markers. `readLock` cannot
 * parse such a lock, but it is not a missing one: `agentsmesh merge` rebuilds it.
 */
export function lockHasConflictMarkers(canonicalDir: string): boolean {
  try {
    return hasConflictMarkers(readFileSync(join(canonicalDir, '.lock'), 'utf8'));
  } catch {
    return false;
  }
}
