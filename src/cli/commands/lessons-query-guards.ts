import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { problemFromLoad } from '../../lessons/graph-problem.js';
import type { ResilientGraphLoad } from '../../lessons/graph-store.js';
import { ancestorLessonsProjectDir, lessonsSetupHint } from '../../lessons/paths.js';
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

/**
 * Warning for recall with no usable graph. Recall degrades to no lessons
 * (exit 0) with a warning that names the cause and the fix.
 */
export function degradedRecallWarning(
  load: Exclude<ResilientGraphLoad, { status: 'ok' }>,
  projectRoot: string,
  keywordOnlyWarning: string | undefined,
  configWarning: string | undefined,
): string | undefined {
  const problem = problemFromLoad(projectRoot, load);
  const cause =
    problem !== null
      ? `recall returned no lessons: ${problem.message}`
      : mergeWarnings(strayDirWarning(projectRoot) ?? lessonsSetupHint(), keywordOnlyWarning);
  return mergeWarnings(cause, configWarning);
}
