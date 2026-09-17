import { normalizeRule } from './add-helpers.js';
import type { LessonsGraph } from './graph-schema.js';
import { isSafeRegexPattern } from './regex-safety.js';
import type { ValidationFinding } from './validate.js';

export function collectDuplicateRules(graph: LessonsGraph, findings: ValidationFinding[]): void {
  const byKey = new Map<string, string[]>();
  for (const [lessonId, lesson] of Object.entries(graph.lessons)) {
    // Only active lessons compete: a superseded/deprecated copy is not recalled,
    // so it is not a functional duplicate — this is what lets `merge` repair a
    // duplicate by superseding the loser.
    if (lesson.status !== 'active') continue;
    const key = normalizeRule(lesson.rule);
    const bucket = byKey.get(key) ?? [];
    bucket.push(lessonId);
    byKey.set(key, bucket);
  }
  for (const [key, ids] of byKey) {
    if (ids.length < 2) continue;
    const sorted = [...ids].sort();
    for (const lessonId of sorted) {
      const others = sorted.filter((other) => other !== lessonId);
      findings.push({
        level: 'error',
        code: 'DUPLICATE_RULE',
        message: `Lesson "${lessonId}" duplicates rule text of: ${others.join(', ')} (normalized key: "${key.slice(0, 60)}").`,
        lessonId,
      });
    }
  }
}

/**
 * A `command_pattern` trigger whose pattern is not a valid regex is dead: recall
 * compiles it with `new RegExp` and a throw is swallowed as a non-match, so the
 * lesson silently becomes unreachable via that trigger. A *valid* pattern that
 * is ReDoS-unsafe (catastrophic backtracking, e.g. `(a+)+`) is worse: recall
 * would execute it on every command and could hang. Flag both as errors so the
 * transactional write path rejects them at capture time (recall additionally
 * skips them at runtime — see regex-safety.ts).
 */
export function collectInvalidTriggerPatterns(
  graph: LessonsGraph,
  findings: ValidationFinding[],
): void {
  for (const [triggerId, trigger] of Object.entries(graph.triggers)) {
    if (trigger.kind !== 'command_pattern') continue;
    try {
      new RegExp(trigger.pattern);
    } catch (err) {
      findings.push({
        level: 'error',
        code: 'INVALID_TRIGGER_PATTERN',
        message: `Trigger "${triggerId}" has an invalid command_pattern regex (${trigger.pattern}): ${err instanceof Error ? err.message : String(err)}.`,
        triggerId,
      });
      continue;
    }
    if (!isSafeRegexPattern(trigger.pattern)) {
      findings.push({
        level: 'error',
        code: 'UNSAFE_TRIGGER_PATTERN',
        message: `Trigger "${triggerId}" has a command_pattern regex outside the provably-linear subset (${trigger.pattern}): it can backtrack catastrophically (e.g. a quantified group like (a+)+ or (a|aa)+, adjacent repetition like a+a+, or a backreference/lookaround). Rewrite using a linear pattern.`,
        triggerId,
      });
    }
  }
}

/**
 * A `file_glob` trigger whose pattern contains a backslash is dead: recall
 * relativizes every `--file` input to forward slashes (normalizeRecallFile),
 * so picomatch never matches a backslash pattern and the lesson silently
 * becomes unreachable via that trigger. `add` normalizes new patterns; this is
 * the `validate` counterpart that surfaces any backslash pattern stored before
 * the normalization existed (or inserted by a hand-edit).
 */
export function collectBackslashGlobPatterns(
  graph: LessonsGraph,
  findings: ValidationFinding[],
): void {
  for (const [triggerId, trigger] of Object.entries(graph.triggers)) {
    if (trigger.kind !== 'file_glob') continue;
    if (!trigger.pattern.includes('\\')) continue;
    findings.push({
      level: 'error',
      code: 'BACKSLASH_GLOB_PATTERN',
      message: `Trigger "${triggerId}" has a file_glob pattern with a backslash (${trigger.pattern}); recall normalizes paths to forward slashes, so it never fires. Replace \\ with /.`,
      triggerId,
    });
  }
}

/**
 * Trigger ids are content-addressed from (kind, pattern), so `add` can never
 * create two nodes for the same pattern. Validation enforces the invariant
 * structurally — a public/low-level mutation (or hand-edit) that inserts a
 * second id for an existing (kind, pattern) would bypass deduplication and
 * distort fanout accounting and ranking specificity. Flag every member of a
 * duplicate group as an error.
 */
export function collectDuplicateTriggers(graph: LessonsGraph, findings: ValidationFinding[]): void {
  const byKey = new Map<string, string[]>();
  for (const [triggerId, trigger] of Object.entries(graph.triggers)) {
    const key = `${trigger.kind}|${trigger.pattern}`;
    const bucket = byKey.get(key) ?? [];
    bucket.push(triggerId);
    byKey.set(key, bucket);
  }
  for (const [key, ids] of byKey) {
    if (ids.length < 2) continue;
    const sorted = [...ids].sort();
    for (const triggerId of sorted) {
      const others = sorted.filter((other) => other !== triggerId);
      findings.push({
        level: 'error',
        code: 'DUPLICATE_TRIGGER',
        message: `Trigger "${triggerId}" duplicates (kind, pattern) of: ${others.join(', ')} (key: "${key}").`,
        triggerId,
      });
    }
  }
}

/** Active-fanout threshold above which a trigger is "broad" (recall leans on ranking). */
const HIGH_FANOUT_THRESHOLD = 10;

/**
 * One summary warning (not one-per-trigger — that would be noise on a broad
 * graph) reporting how many triggers fan out past the threshold. Surfaces the
 * trigger imprecision that ranking compensates for, rather than hiding it.
 */
export function collectFanout(graph: LessonsGraph, findings: ValidationFinding[]): void {
  const fanout = new Map<string, number>();
  for (const lesson of Object.values(graph.lessons)) {
    if (lesson.status !== 'active') continue;
    for (const t of lesson.triggers) fanout.set(t, (fanout.get(t) ?? 0) + 1);
  }
  let over = 0;
  let max = 0;
  for (const n of fanout.values()) {
    if (n > HIGH_FANOUT_THRESHOLD) over += 1;
    if (n > max) max = n;
  }
  if (over > 0) {
    findings.push({
      level: 'warning',
      code: 'HIGH_FANOUT_TRIGGERS',
      message: `${over} trigger(s) each match more than ${HIGH_FANOUT_THRESHOLD} active lessons (max ${max}); recall returns the ranked top by default — consider per-lesson trigger refinement to improve precision.`,
    });
  }
}

/**
 * Recall delivers a handful of matches per call, so a trigger set shared by more
 * lessons than that is a tie the ranker cannot break: identical triggers score
 * identically on specificity, and the choice falls to topic coherence and rule
 * text. Which lessons an agent actually sees becomes close to arbitrary.
 *
 * Derived from the graph alone, so it works without telemetry.
 */
const TIED_TRIGGER_SET_THRESHOLD = 5;

export function collectTriggerSetCollisions(
  graph: LessonsGraph,
  findings: ValidationFinding[],
): void {
  const bySet = new Map<string, string[]>();
  for (const [id, lesson] of Object.entries(graph.lessons)) {
    if (lesson.status !== 'active') continue;
    const key = [...lesson.triggers].sort().join(',');
    if (key === '') continue;
    const group = bySet.get(key);
    if (group === undefined) bySet.set(key, [id]);
    else group.push(id);
  }

  const contested = [...bySet.values()].filter((ids) => ids.length > TIED_TRIGGER_SET_THRESHOLD);
  if (contested.length === 0) return;

  const largest = contested.reduce((a, b) => (b.length > a.length ? b : a));
  const affected = contested.reduce((n, ids) => n + ids.length, 0);
  findings.push({
    level: 'warning',
    code: 'TIED_TRIGGER_SETS',
    message:
      `${contested.length} trigger set(s) are each shared by more than ${TIED_TRIGGER_SET_THRESHOLD} ` +
      `active lessons (largest ${largest.length}, ${affected} lessons in total). Identical triggers ` +
      'score identically on specificity, so recall picks among them by weaker signals — split the ' +
      'triggers so the lesson that matters for a given file can win.',
    lessonIds: largest.sort(),
  });
}
