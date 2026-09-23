import { isBroadFileGlob } from './glob-breadth.js';
import { isBroadCommandPattern } from './command-pattern-breadth.js';
import { missingGlobState } from './file-glob-liveness.js';
import { getGlobMatcher } from './glob-safety.js';
import type { LessonsGraph } from './graph-schema.js';
import { gitHistoryOf } from './project-files.js';
import type { ValidationFinding } from './validate.js';

/**
 * Trigger-LIVENESS checks: a trigger referenced by an active lesson that can
 * never fire makes the lesson unreachable, silently, as the codebase moves
 * underneath it. These are distinct from breadth — the system deliberately
 * optimizes for precision, so neither check ever asks to WIDEN a narrow trigger;
 * `collectDeadFileGlobs` flags a glob whose path git history removed, and
 * `collectRunnerAnchoredPatterns` flags a scope-MATCH gap (anchored to one
 * runner), not a scope-too-narrow one.
 */

export function activeTriggerIds(graph: LessonsGraph): Set<string> {
  const ids = new Set<string>();
  for (const lesson of Object.values(graph.lessons)) {
    if (lesson.status !== 'active') continue;
    for (const t of lesson.triggers) ids.add(t);
  }
  return ids;
}

/** Active `file_glob` trigger ids that match no file on disk, split by {@link missingGlobState}. */
export interface FileGlobLiveness {
  /** Git history renamed or deleted what they matched: safe to detach. */
  readonly dead: ReadonlySet<string>;
  /** No proof of removal (not created yet, ignored output, no git): never detached. */
  readonly pending: ReadonlySet<string>;
}

/**
 * Judge every `file_glob` on an active lesson against `knownPaths` (on-disk,
 * project-relative, forward-slash) and the git evidence it carries (see
 * `listProjectFiles`). Git is read only when some glob matches nothing on disk;
 * a plain set carries no evidence, so nothing in it can be proven dead.
 * `triggerIds` narrows the judgement (e.g. to one captured lesson).
 */
export function fileGlobLiveness(
  graph: LessonsGraph,
  knownPaths: ReadonlySet<string>,
  triggerIds?: readonly string[],
): FileGlobLiveness {
  const active = triggerIds === undefined ? activeTriggerIds(graph) : new Set(triggerIds);
  const paths = [...knownPaths];
  const missing: Array<[string, string]> = [];
  for (const [triggerId, trigger] of Object.entries(graph.triggers)) {
    if (trigger.kind !== 'file_glob' || !active.has(triggerId)) continue;
    // An unsafe glob gets its own UNSAFE_GLOB_PATTERN error; never judge it here.
    const matcher = getGlobMatcher(trigger.pattern);
    if (matcher === null) continue;
    if (!paths.some((p) => matcher.test(p))) missing.push([triggerId, trigger.pattern]);
  }
  const dead = new Set<string>();
  const pending = new Set<string>();
  if (missing.length === 0) return { dead, pending };
  const history = gitHistoryOf(knownPaths);
  for (const [triggerId, pattern] of missing) {
    const state = missingGlobState(pattern, history);
    if (state === 'dead') dead.add(triggerId);
    else if (state === 'pending') pending.add(triggerId);
  }
  return { dead, pending };
}

/** Dead globs only. Shared by `validate` (warns), `prune` and auto-prune (detach). */
export function deadFileGlobIds(
  graph: LessonsGraph,
  knownPaths: ReadonlySet<string>,
): ReadonlySet<string> {
  return fileGlobLiveness(graph, knownPaths).dead;
}

/**
 * Warn on each dead `file_glob`: the lesson is unreachable via that trigger
 * because git history moved or deleted its path. Pending globs are not reported
 * (they fire once the path exists). Skipped entirely when the caller has no file
 * list (see {@link validateLessonsGraph}).
 */
export function collectDeadFileGlobs(
  graph: LessonsGraph,
  findings: ValidationFinding[],
  knownPaths: ReadonlySet<string>,
): void {
  for (const triggerId of deadFileGlobIds(graph, knownPaths)) {
    findings.push({
      level: 'warning',
      code: 'DEAD_FILE_GLOB',
      message: `file_glob trigger "${triggerId}" (${graph.triggers[triggerId]?.pattern ?? ''}) matches no file, and git history shows its path was renamed or deleted — the lesson is unreachable via this trigger. Re-point it at the current path, or detach it with \`lessons untrigger\`, or run \`lessons prune --apply\`.`,
      triggerId,
    });
  }
}

/** How many working-tree paths a `file_glob` pattern matches — for the breadth guardrail. */
export function fileGlobMatchCount(pattern: string, knownPaths: ReadonlySet<string>): number {
  const matcher = getGlobMatcher(pattern);
  if (matcher === null) return 0;
  let n = 0;
  for (const p of knownPaths) if (matcher.test(p)) n += 1;
  return n;
}

/** Anchored to a single package-runner at the start of the pattern. */
const RUNNER_ANCHOR = /^\^(pnpm|npm|npx|yarn|bun)\b/;

/**
 * A `command_pattern` anchored to ONE runner (e.g. `^pnpm test`, `^npx vitest`)
 * will not fire for the same task run another way — an agent that types
 * `npx vitest` gets nothing from a `^pnpm` lesson, and `npx` is the shape agents
 * actually use. Scope-MATCH, not breadth: the fix is to drop the `^<runner>`
 * anchor and key on the task verb, not to widen what the lesson covers.
 */
export function collectRunnerAnchoredPatterns(
  graph: LessonsGraph,
  findings: ValidationFinding[],
): void {
  const active = activeTriggerIds(graph);
  for (const [triggerId, trigger] of Object.entries(graph.triggers)) {
    if (trigger.kind !== 'command_pattern') continue;
    if (!active.has(triggerId)) continue;
    if (!RUNNER_ANCHOR.test(trigger.pattern)) continue;
    findings.push({
      level: 'warning',
      code: 'RUNNER_ANCHORED_PATTERN',
      message: `command_pattern trigger "${triggerId}" (${trigger.pattern}) is anchored to one runner — it won't fire for the same task via another runner (e.g. \`npx\` vs \`pnpm\`). Drop the \`^<runner>\` anchor and key on the task (e.g. \`\\bvitest\\b\`).`,
      triggerId,
    });
  }
}

/**
 * A `command_pattern` on an active lesson that matches the empty string or most
 * unrelated commands fires on every recall. `add` rejects a new one
 * (BROAD_COMMAND_PATTERN, exit 2); this is the `validate` counterpart for a
 * graph built before that guardrail existed (or a hand-edit). Warn-only.
 */
/**
 * A `file_glob` that covers most of the tree fires on nearly every edit, so it
 * crowds out the rule written about the file actually being touched once the
 * recall token budget bites. Warn-only and never blocking: a deliberate
 * file-CLASS trigger is the documented way to state general behaviour, and only
 * genuinely repo-wide patterns are reported.
 */
export function collectBroadFileGlobs(graph: LessonsGraph, findings: ValidationFinding[]): void {
  const active = activeTriggerIds(graph);
  for (const [triggerId, trigger] of Object.entries(graph.triggers)) {
    if (trigger.kind !== 'file_glob') continue;
    if (!active.has(triggerId)) continue;
    if (!isBroadFileGlob(trigger.pattern)) continue;
    findings.push({
      level: 'warning',
      code: 'BROAD_FILE_GLOB',
      message: `file_glob trigger "${triggerId}" (${trigger.pattern}) matches most of the repository, so it outranks nothing and crowds the recall budget. Narrow it to the directory or file class the rule is really about, or detach it with \`lessons untrigger\`.`,
      triggerId,
    });
  }
}

export function collectBroadCommandPatterns(
  graph: LessonsGraph,
  findings: ValidationFinding[],
): void {
  const active = activeTriggerIds(graph);
  for (const [triggerId, trigger] of Object.entries(graph.triggers)) {
    if (trigger.kind !== 'command_pattern') continue;
    if (!active.has(triggerId)) continue;
    if (!isBroadCommandPattern(trigger.pattern)) continue;
    findings.push({
      level: 'warning',
      code: 'BROAD_COMMAND_PATTERN',
      message: `command_pattern trigger "${triggerId}" (${trigger.pattern}) matches nearly every command, so the lesson fires on every recall. Key it on the action (e.g. \`\\bgit commit\\b\`), or detach it with \`lessons untrigger\`.`,
      triggerId,
    });
  }
}
