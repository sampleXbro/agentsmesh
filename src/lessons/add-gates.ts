import {
  BroadCommandPatternError,
  EmptyRuleError,
  InvalidTopicIdError,
  NoTriggerError,
  RuleTooLongError,
  TopicSummaryRequiredError,
  UnknownTopicError,
  UnrecallableLessonError,
} from './add-errors.js';
import type { AddLessonInput, AddLessonOptions } from './add.js';
import { isBroadCommandPattern } from './command-pattern-breadth.js';
import { MAX_RULE_LENGTH, type LessonsGraph } from './graph-schema.js';
import { codePointLength } from './rule-line.js';
import {
  blockingDeadTriggers,
  ineffectiveTriggers,
  type IneffectiveTrigger,
} from './trigger-effectiveness.js';

/**
 * Blocking capture gates for {@link addLessonInto}. Each throws a dedicated
 * rejection error BEFORE the transactional write barrier, so a rejected capture
 * persists nothing and surfaces a precise, actionable reason (CLI exit 2 with
 * the add hint; MCP VALIDATION_FAILED with the machine code).
 */

/** Trim the rule, rejecting an empty or over-long one (a malformed capture). */
export function assertRuleShape(rule: string): string {
  const trimmed = rule.trim();
  if (trimmed.length === 0) throw new EmptyRuleError();
  // A rule far longer than one sentence is a malformed capture; block it before
  // it can bloat every recall that surfaces it (the hook also truncates as a
  // last-resort defense for already-stored / hostile graphs).
  const length = codePointLength(trimmed);
  if (length > MAX_RULE_LENGTH) throw new RuleTooLongError(length, MAX_RULE_LENGTH);
  return trimmed;
}

/**
 * Check the topic id and create a new topic when allowed. Returns whether the
 * topic is new. Runs before the trigger gates, so a topic error wins.
 */
export function ensureTopic(
  graph: LessonsGraph,
  topic: string,
  options: AddLessonOptions,
): boolean {
  if (!/^[a-z0-9-]+$/.test(topic)) throw new InvalidTopicIdError(topic);
  if (graph.topics[topic] !== undefined) return false;
  if (options.allowNewTopic !== true) throw new UnknownTopicError(topic);
  const summary = options.topicSummary?.trim() ?? '';
  if (summary.length === 0) throw new TopicSummaryRequiredError(topic);
  graph.topics[topic] = { summary };
  return true;
}

/**
 * An ALWAYS-ON lesson (scope:'always') is delivered on every task, not matched
 * by triggers, so it needs none — the trigger gates are skipped for it (as
 * legacy-merge recovery also does).
 */
export function skipsTriggerGates(input: AddLessonInput, options: AddLessonOptions): boolean {
  return options.allowNoTrigger === true || input.scope === 'always';
}

function countInputTriggers(triggers: AddLessonInput['triggers']): number {
  return (
    (triggers.files?.length ?? 0) +
    (triggers.commands?.length ?? 0) +
    (triggers.keywords?.length ?? 0)
  );
}

/**
 * Gates on the INPUT triggers, before any trigger node is created.
 * - A lesson with no trigger can never be recalled: enforce ≥1 trigger on the
 *   RESULTING lesson (an upsert keeps the existing lesson's triggers, so it may
 *   pass no new ones).
 * - A command pattern that matches nearly every command is a leak, not a
 *   trigger. Legacy-merge recovery folds historical lessons as-is (`validate`
 *   surfaces them as BROAD_COMMAND_PATTERN).
 */
export function assertTriggerInputs(
  input: AddLessonInput,
  options: AddLessonOptions,
  existingTriggerCount: number,
): void {
  if (
    !skipsTriggerGates(input, options) &&
    countInputTriggers(input.triggers) === 0 &&
    existingTriggerCount === 0
  ) {
    throw new NoTriggerError();
  }
  if (options.allowNoTrigger !== true) {
    const broad = (input.triggers.commands ?? []).find(isBroadCommandPattern);
    if (broad !== undefined) throw new BroadCommandPatternError(broad);
  }
}

/** Warning for a command trigger dropped at capture because it can never fire. */
export interface DeadCommandWarning {
  readonly code: 'DEAD_COMMAND_PATTERN';
  readonly message: string;
}

interface MergedTriggers {
  readonly triggerIds: string[];
  readonly newTriggerIds: string[];
}

/**
 * Drop the input command triggers that can never fire (an invalid regex, or one
 * the linear engine cannot run) instead of letting the write barrier refuse the
 * whole capture: the lesson keeps its live triggers and the caller is warned. A
 * node created for a dropped pattern is removed again, so it is never written.
 * Legacy-merge recovery (`allowNoTrigger`) keeps folding lessons as-is.
 */
export function dropDeadCommandTriggers(
  graph: LessonsGraph,
  merged: MergedTriggers,
  options: AddLessonOptions,
): MergedTriggers & { readonly dropped: IneffectiveTrigger[] } {
  if (options.allowNoTrigger === true) return { ...merged, dropped: [] };
  const dropped = ineffectiveTriggers(graph, merged.triggerIds).filter(
    (t) => t.kind === 'command_pattern',
  );
  const dead = new Set(dropped.map((t) => t.id));
  for (const id of merged.newTriggerIds) if (dead.has(id)) delete graph.triggers[id];
  return {
    triggerIds: merged.triggerIds.filter((id) => !dead.has(id)),
    newTriggerIds: merged.newTriggerIds.filter((id) => !dead.has(id)),
    dropped,
  };
}

export function deadCommandWarning(trigger: IneffectiveTrigger): DeadCommandWarning {
  return {
    code: 'DEAD_COMMAND_PATTERN',
    message: `Dropped command trigger ${JSON.stringify(trigger.pattern)} (not saved): ${trigger.reason}.`,
  };
}

/**
 * A lesson whose RESULTING triggers are ALL dead on the mandatory --file/--cmd
 * recall path is unrecallable — block it (the symmetric, blocking counterpart
 * to the warn-only guardrails). Computed on the merged set, so an upsert that
 * adds a dead trigger to an already-effective lesson is fine. `dropped` are the
 * dead command triggers already removed from that set; when nothing live is
 * left they are named too. A throw here aborts the transactional write, so
 * nothing is persisted.
 */
export function assertRecallable(
  graph: LessonsGraph,
  resultingTriggers: readonly string[],
  dropped: readonly IneffectiveTrigger[],
): void {
  const blockingDead = blockingDeadTriggers(graph, resultingTriggers);
  const dead = [...dropped, ...blockingDead];
  if (dead.length > 0 && blockingDead.length === resultingTriggers.length) {
    throw new UnrecallableLessonError(dead);
  }
}
