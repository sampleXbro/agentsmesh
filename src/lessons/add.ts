import { makeLessonId, mergeTriggers, normalizeRule, todayIso, union } from './add-helpers.js';
import { UnknownTopicError } from './add-errors.js';
import {
  assertRecallable,
  assertRuleShape,
  assertTriggerInputs,
  skipsTriggerGates,
} from './add-gates.js';
import type { AutoPruneSummary } from './auto-prune.js';
import { type GuardrailWarning, inspectCapturedLesson } from './capture-guardrails.js';
import { nearDuplicateWarning } from './capture-near-duplicate.js';
import type { LessonsGraph } from './graph-schema.js';
import { mutateLessonsGraph } from './mutate.js';

// Re-export the capture rejection errors so existing `from './add.js'` importers
// (CLI/MCP surfacing, tests) keep working after the split into add-errors.ts.
export {
  BroadCommandPatternError,
  EmptyRuleError,
  NoTriggerError,
  RuleTooLongError,
  UnknownTopicError,
  UnrecallableLessonError,
} from './add-errors.js';
export { TriggerFileGlobError } from './trigger-file-glob.js';

export interface AddLessonTriggers {
  readonly files?: readonly string[];
  readonly commands?: readonly string[];
  readonly keywords?: readonly string[];
}

export interface AddLessonInput {
  readonly rule: string;
  readonly topic: string;
  readonly triggers: AddLessonTriggers;
  readonly evidence?: readonly string[];
  readonly rationale?: string;
  readonly createdAt?: string;
  /** `'always'` = a universal always-on lesson (no trigger needed; gates skipped). */
  readonly scope?: 'always';
}

export interface AddLessonOptions {
  readonly allowNewTopic?: boolean;
  readonly topicSummary?: string;
  readonly retries?: number;
  /**
   * Skip the "a lesson needs at least one trigger" guard. Set only by the
   * legacy-merge recovery path, which folds historical lessons that may predate
   * the requirement; interactive capture (CLI/MCP) always enforces it so a fresh
   * agent cannot create an unreachable lesson.
   */
  readonly allowNoTrigger?: boolean;
  /**
   * Working-tree file list (project-relative, forward-slash) enabling the
   * warn-only DEAD_GLOB guardrail. The capture entry point supplies it; the
   * legacy-merge path omits it, so no tree walk happens off the capture path.
   */
  readonly knownPaths?: ReadonlySet<string>;
  /**
   * Project root for making absolute `--trigger-file` globs project-relative
   * (and rejecting ones outside it). `addLesson` sets it; legacy merge omits it.
   */
  readonly projectRoot?: string;
}

export interface AddLessonResult {
  readonly id: string;
  readonly isNewLesson: boolean;
  readonly isNewTopic: boolean;
  readonly newTriggerIds: string[];
  /** Non-blocking capture guardrail warnings for the resulting (merged) lesson. */
  readonly warnings: GuardrailWarning[];
  /**
   * Counts of structural cruft the opt-in auto-prune cleaned up right after this
   * capture (config `autoPrune: true`). Present only when something was pruned;
   * absent when auto-prune is off or there was nothing to clean.
   */
  readonly autoPruned?: AutoPruneSummary;
}

export async function addLesson(
  projectRoot: string,
  input: AddLessonInput,
  options: AddLessonOptions = {},
): Promise<AddLessonResult> {
  // mutateLessonsGraph migrates a legacy store first, so the very first capture
  // cannot create lessons.json over an unmigrated index.yaml and strand it.
  const withRoot = { ...options, projectRoot: options.projectRoot ?? projectRoot };
  return mutateLessonsGraph(projectRoot, (graph) => addLessonInto(graph, input, withRoot), {
    retries: options.retries,
  });
}

/**
 * Pure mutation over the loaded graph. Dedup is by normalized rule text across
 * ALL topics: a re-captured rule UPSERTS — its new triggers, evidence,
 * rationale, and topic are merged into the existing lesson rather than silently
 * dropped, and no duplicate is created (so the active-only DUPLICATE_RULE check
 * stays satisfied). Exported so legacy MERGE recovery can fold each legacy
 * lesson into an existing graph through the same dedup + content-addressing path.
 */
export function addLessonInto(
  graph: LessonsGraph,
  input: AddLessonInput,
  options: AddLessonOptions,
): AddLessonResult {
  const ruleKey = normalizeRule(input.rule);
  const trimmedRule = assertRuleShape(input.rule);
  const existingId = findExistingLessonByRule(graph, ruleKey);

  // Topic validity is checked first so an unknown-topic / missing-summary error
  // takes precedence over the trigger gates below (clearer, and stable for the
  // documented exit codes).
  const isNewTopic = graph.topics[input.topic] === undefined;
  if (isNewTopic) {
    if (options.allowNewTopic !== true) throw new UnknownTopicError(input.topic);
    if (options.topicSummary === undefined || options.topicSummary.length === 0) {
      throw new Error(`addLesson: new topic "${input.topic}" requires topicSummary.`);
    }
    graph.topics[input.topic] = { summary: options.topicSummary };
  }

  // Gates (see add-gates.ts): a throw aborts the transactional write.
  const existing = existingId !== null ? graph.lessons[existingId] : undefined;
  assertTriggerInputs(input, options, existing?.triggers.length ?? 0);
  const { triggerIds, newTriggerIds } = mergeTriggers(graph, input.triggers, options.projectRoot);
  if (!skipsTriggerGates(input, options)) {
    assertRecallable(
      graph,
      existing === undefined ? triggerIds : union(existing.triggers, triggerIds),
    );
  }

  if (existingId !== null) {
    // existingId came from Object.entries(graph.lessons), so it is present.
    const existing = graph.lessons[existingId]!;
    graph.lessons[existingId] = {
      ...existing,
      topics: union(existing.topics, [input.topic]),
      triggers: union(existing.triggers, triggerIds),
      evidence: union(existing.evidence, input.evidence ?? []),
      ...(existing.rationale === undefined && input.rationale !== undefined
        ? { rationale: input.rationale }
        : {}),
      // Re-capturing a rule with --scope always promotes it to always-on.
      ...(input.scope === 'always' ? { scope: 'always' as const } : {}),
    };
    return {
      id: existingId,
      isNewLesson: false,
      isNewTopic,
      newTriggerIds,
      // Near-duplicate detection is meaningless on an upsert (the lesson IS the
      // match), so only DEAD_GLOB/hygiene warnings apply here.
      warnings: inspectCapturedLesson(graph, existingId, options.knownPaths),
    };
  }

  const id = makeLessonId(graph, input.topic, ruleKey);
  graph.lessons[id] = {
    rule: trimmedRule,
    topics: [input.topic],
    triggers: triggerIds,
    evidence: input.evidence === undefined ? [] : [...input.evidence],
    status: 'active',
    createdAt: input.createdAt ?? todayIso(),
    ...(input.rationale === undefined ? {} : { rationale: input.rationale }),
    ...(input.scope === 'always' ? { scope: 'always' as const } : {}),
  };
  const warnings = inspectCapturedLesson(graph, id, options.knownPaths);
  const nearDup = nearDuplicateWarning(graph, id);
  return {
    id,
    isNewLesson: true,
    isNewTopic,
    newTriggerIds,
    warnings: nearDup === null ? warnings : [...warnings, nearDup],
  };
}

/**
 * Find an ACTIVE lesson with the same normalized rule. Inactive
 * (deprecated/superseded) lessons are ignored on purpose: re-capturing a rule
 * whose only match is dead must produce a fresh ACTIVE lesson (a live
 * replacement), not silently enrich a corpse that recall will never surface.
 */
function findExistingLessonByRule(graph: LessonsGraph, ruleKey: string): string | null {
  for (const [id, lesson] of Object.entries(graph.lessons)) {
    if (lesson.status !== 'active') continue;
    if (normalizeRule(lesson.rule) === ruleKey) return id;
  }
  return null;
}
