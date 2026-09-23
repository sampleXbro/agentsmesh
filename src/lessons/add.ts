import {
  describeUpsert,
  findExistingLessonByRule,
  makeLessonId,
  mergeTriggers,
  normalizeRule,
  todayIso,
  union,
  upsertLesson,
} from './add-helpers.js';
import {
  assertRecallable,
  assertRuleShape,
  assertTriggerInputs,
  deadCommandWarning,
  dropDeadCommandTriggers,
  ensureTopic,
  skipsTriggerGates,
  type DeadCommandWarning,
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
  InvalidTopicIdError,
  NoTriggerError,
  RuleTooLongError,
  TopicSummaryRequiredError,
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
}

interface AddLessonIntoOptions extends AddLessonOptions {
  /**
   * Project root for making absolute `--trigger-file` globs project-relative
   * (and rejecting ones outside it). `addLesson` sets it; legacy merge omits it.
   */
  readonly projectRoot?: string;
}

/** A non-blocking capture warning: a guardrail nudge or a dropped dead command trigger. */
export type AddLessonWarning = GuardrailWarning | DeadCommandWarning;

export interface AddLessonResult {
  readonly id: string;
  readonly isNewLesson: boolean;
  readonly isNewTopic: boolean;
  readonly newTriggerIds: string[];
  /** What a re-add changed on the existing lesson; empty for a new lesson or a no-op. */
  readonly changes: string[];
  /** Non-blocking capture warnings for the resulting (merged) lesson. */
  readonly warnings: AddLessonWarning[];
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
  return mutateLessonsGraph(
    projectRoot,
    (graph) => addLessonInto(graph, input, { ...options, projectRoot }),
    { retries: options.retries },
  );
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
  options: AddLessonIntoOptions,
): AddLessonResult {
  const ruleKey = normalizeRule(input.rule);
  const trimmedRule = assertRuleShape(input.rule);
  const existingId = findExistingLessonByRule(graph, ruleKey);

  const isNewTopic = ensureTopic(graph, input.topic, options);

  // Gates (see add-gates.ts): a throw aborts the transactional write.
  const existing = existingId !== null ? graph.lessons[existingId] : undefined;
  assertTriggerInputs(input, options, existing?.triggers.length ?? 0);
  const merged = mergeTriggers(graph, input.triggers, options.projectRoot);
  const { triggerIds, newTriggerIds, dropped } = dropDeadCommandTriggers(graph, merged, options);
  if (!skipsTriggerGates(input, options)) {
    const resulting = existing === undefined ? triggerIds : union(existing.triggers, triggerIds);
    assertRecallable(graph, resulting, dropped);
  }
  const droppedWarnings = dropped.map(deadCommandWarning);

  if (existingId !== null && existing !== undefined) {
    const updated = upsertLesson(existing, input, triggerIds);
    graph.lessons[existingId] = updated;
    return {
      id: existingId,
      isNewLesson: false,
      isNewTopic,
      newTriggerIds,
      changes: describeUpsert(existing, updated),
      // Near-duplicate detection is meaningless on an upsert (the lesson IS the
      // match), so only DEAD_GLOB/hygiene warnings apply here.
      warnings: [
        ...inspectCapturedLesson(graph, existingId, options.knownPaths),
        ...droppedWarnings,
      ],
    };
  }

  const id = makeLessonId(graph, input.topic, ruleKey);
  graph.lessons[id] = {
    rule: trimmedRule,
    topics: [input.topic],
    triggers: triggerIds,
    evidence: [...new Set(input.evidence ?? [])],
    status: 'active',
    createdAt: input.createdAt ?? todayIso(),
    ...(input.rationale === undefined ? {} : { rationale: input.rationale }),
    ...(input.scope === 'always' ? { scope: 'always' as const } : {}),
  };
  const nearDup = nearDuplicateWarning(graph, id);
  return {
    id,
    isNewLesson: true,
    isNewTopic,
    newTriggerIds,
    changes: [],
    warnings: [
      ...inspectCapturedLesson(graph, id, options.knownPaths),
      ...(nearDup === null ? [] : [nearDup]),
      ...droppedWarnings,
    ],
  };
}
