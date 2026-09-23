import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describeCorruptGraph } from '../../lessons/graph-problem.js';
import { ancestorLessonsProjectDir } from '../../lessons/paths.js';
import type { LessonsFlags } from './lessons-helpers.js';

/**
 * Input validation + warning assembly for the `lessons query` handler, split
 * from lessons-query-handler.ts for the 200-line limit.
 */

/** Returns an error message if the flag is present but not a positive integer, else null. */
export function validatePositiveIntFlag(flags: LessonsFlags, name: string): string | null {
  const v = flags[name];
  if (v === undefined || v === false) return null;
  const n = typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isInteger(n) || n < 1) return `Invalid --${name}: expected a positive integer.`;
  return null;
}

/** Returns an error message if --format is present with a value outside plain|md|json, else null. */
export function validateFormatFlag(flags: LessonsFlags): string | null {
  const v = flags.format;
  if (v === undefined) return null;
  if (v === 'plain' || v === 'md' || v === 'json') return null;
  return 'Invalid --format: expected plain|md|json.';
}

/** Join the non-empty warning parts into one stderr blob (or undefined when none). */
export function mergeWarnings(...parts: Array<string | undefined>): string | undefined {
  const present = parts.filter((p): p is string => p !== undefined && p.length > 0);
  return present.length > 0 ? present.join('\n') : undefined;
}

/**
 * Recall warning for a graph that failed to parse. An unresolved git merge is
 * named as such (with the command that fixes it); anything else goes to
 * `lessons validate`, which carries the full, copy-first recovery advice.
 */
export function unreadableGraphWarning(projectRoot: string, error: Error): string {
  if (describeCorruptGraph(projectRoot, error).kind === 'conflict') {
    return (
      'lessons.json has an unresolved git merge conflict — recall returned no lessons. ' +
      'Run `agentsmesh lessons resolve` to combine the lessons from both branches.'
    );
  }
  return `lessons.json is unreadable (corrupt) — recall returned no lessons. Run \`agentsmesh lessons validate\`. (${error.message})`;
}

/**
 * Warn when recall finds no graph at the CWD but a `.agentsmesh` project exists
 * in an ancestor — the classic "invoked from a subdirectory" trap, which would
 * otherwise look like an empty (but valid) recall.
 */
export function strayDirWarning(projectRoot: string): string | undefined {
  if (existsSync(join(projectRoot, '.agentsmesh'))) return undefined;
  const ancestor = ancestorLessonsProjectDir(projectRoot);
  if (ancestor === null) return undefined;
  return `no lessons graph here — this directory has no .agentsmesh, but a lessons project exists at ${ancestor.replaceAll('\\', '/')}. Run lessons from there (cd into it) for recall to work.`;
}
