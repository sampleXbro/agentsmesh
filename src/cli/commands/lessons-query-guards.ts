import { problemFromLoad } from '../../lessons/graph-problem.js';
import type { ResilientGraphLoad } from '../../lessons/graph-store.js';
import { lessonsSetupHint } from '../../lessons/paths.js';
import type { LessonsFlags } from './lessons-helpers.js';

/**
 * Input validation + warning assembly for the `lessons query` handler, split
 * from lessons-query-handler.ts for the 200-line limit.
 */

/** Returns an error message if the flag is present but not a positive integer, else null. */
export function validatePositiveIntFlag(flags: LessonsFlags, name: string): string | null {
  const v = flags[name];
  if (v === undefined || v === false) return null;
  // Digits only: Number() would read "0x10" or "1e1" as a number.
  const n = typeof v === 'string' && /^\s*\d+\s*$/.test(v) ? Number(v) : NaN;
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
 * Warning for recall with no usable graph. Recall degrades to no lessons
 * (exit 0) with a warning that names the cause and the fix.
 */
export function degradedRecallWarning(
  load: Exclude<ResilientGraphLoad, { status: 'ok' }>,
  projectRoot: string,
  keywordOnlyWarning: string | undefined,
  configWarning: string | undefined,
  { migrationError }: { migrationError?: string } = {},
): string | undefined {
  const problem = problemFromLoad(projectRoot, load);
  let cause: string | undefined;
  if (problem !== null) cause = `recall returned no lessons: ${problem.message}`;
  else if (migrationError !== undefined) cause = migrationFailure(migrationError);
  else cause = mergeWarnings(lessonsSetupHint(), keywordOnlyWarning);
  return mergeWarnings(cause, configWarning);
}

function migrationFailure(error: string): string {
  return (
    'recall returned no lessons: the legacy lessons store (.agentsmesh/lessons/index.yaml) ' +
    `could not be migrated: ${error.replace(/\s+$/, '')} Fix it, then run ` +
    '`agentsmesh lessons import-md`.'
  );
}
