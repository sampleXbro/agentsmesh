import { MAX_RECOMMENDED_TRIGGERS } from './capture-guardrails.js';
import type { LessonsGraph } from './graph-schema.js';
import { buildFanout } from './ranking-signals.js';
import { fileGlobLiveness } from './validate-liveness.js';

/**
 * Graph curation. Two safe, deterministic operations, both reversible via git
 * (lessons.json is the committed source of truth):
 *
 *  1. Trim over-cap ACTIVE lessons down to `cap` triggers, dropping the
 *     highest-fanout (least specific) triggers first — they are the ones that
 *     dilute recall the most. Never trims below one trigger.
 *  2. Remove dead triggers — those no ACTIVE lesson references (orphans, or
 *     referenced only by superseded/deprecated lessons) — from the table and
 *     strip their (now non-recall-bearing) references everywhere.
 *
 * `planPrune` is a pure read; `applyPruneToGraph` mutates a loaded graph in
 * place (call it inside `mutateLessonsGraph` so the write stays transactional).
 */

export interface LessonTrim {
  readonly id: string;
  /** Trigger ids dropped from this lesson (kept the most specific `cap`). */
  readonly removedTriggers: string[];
  readonly keptCount: number;
}

export interface PrunePlan {
  /** Triggers removed from the table entirely (dead: no active lesson uses them). */
  readonly removedTriggerIds: string[];
  /** Topics removed from the table entirely (referenced by zero lessons, any status). */
  readonly removedTopicIds: string[];
  /** Active lessons trimmed down to the cap. */
  readonly trimmedLessons: LessonTrim[];
  /** Dead `file_glob` triggers detached from a lesson that still keeps ≥1 trigger. */
  readonly removedDeadGlobs: LessonTrim[];
  /** Active lessons left unreachable (every trigger is a dead glob) — REPORTED, not modified (stripping would strand them). */
  readonly unreachableLessons: string[];
  /** The effective per-lesson trigger cap used (clamped to ≥ 1). */
  readonly cap: number;
}

export interface PruneOptions {
  /** Per-lesson trigger cap. Defaults to the capture guardrail recommendation. */
  readonly cap?: number;
  /**
   * Working-tree file list (project-relative, forward-slash), normally from
   * `listProjectFiles` so it carries git evidence. When provided, prune also GCs
   * `file_glob` triggers git history proves dead; pending ones are never touched,
   * and a plain set (no evidence) detaches nothing. Omitted → no liveness pruning,
   * so the transactional write barrier (which has no tree) never strips a glob.
   */
  readonly knownPaths?: ReadonlySet<string>;
  /**
   * Drop the highest-fanout triggers from over-cap active lessons. Defaults to
   * `true` (the full `lessons prune`). Set `false` for the GC-only subset
   * (orphan triggers/topics + non-stranding dead-glob detach) that opt-in
   * auto-prune runs — it never removes a trigger from a within-cap lesson.
   */
  readonly trimOverCap?: boolean;
}

/** Compute (without mutating) what a prune would change. */
export function planPrune(graph: LessonsGraph, options: PruneOptions = {}): PrunePlan {
  const cap = Math.max(1, options.cap ?? MAX_RECOMMENDED_TRIGGERS);
  const fanout = buildFanout(graph);

  const trimmedLessons: LessonTrim[] = [];
  // Trigger ids each active lesson keeps after trimming — drives liveness below.
  const keptByLesson = new Map<string, readonly string[]>();

  for (const [id, lesson] of Object.entries(graph.lessons)) {
    if (lesson.status !== 'active') continue;
    if (options.trimOverCap === false || lesson.triggers.length <= cap) {
      keptByLesson.set(id, lesson.triggers);
      continue;
    }
    // Most specific (lowest fanout) first; deterministic id tie-break.
    // This lesson is active, so buildFanout counted all of its triggers — the
    // lookups always hit (mirrors ranking.ts's fanout invariant).
    const ordered = [...lesson.triggers].sort((a, b) => {
      const fa = fanout.get(a)!;
      const fb = fanout.get(b)!;
      return fa !== fb ? fa - fb : a < b ? -1 : 1;
    });
    const drop = new Set(ordered.slice(cap));
    const kept = lesson.triggers.filter((t) => !drop.has(t)); // preserve original order
    keptByLesson.set(id, kept);
    trimmedLessons.push({ id, removedTriggers: [...drop], keptCount: kept.length });
  }

  // Dead-glob GC: detach a dead `file_glob` from a lesson, but only when the
  // lesson keeps ≥1 other trigger — never strand it. A lesson whose every
  // (post-trim) trigger is a dead glob is reported as unreachable and left as-is
  // (stripping its last trigger would make it invalid / unrecallable).
  const removedDeadGlobs: LessonTrim[] = [];
  const unreachableLessons: string[] = [];
  if (options.knownPaths !== undefined) {
    const { dead } = fileGlobLiveness(graph, options.knownPaths);
    if (dead.size > 0) {
      for (const [id, kept] of keptByLesson) {
        const deadInLesson = kept.filter((t) => dead.has(t));
        if (deadInLesson.length === 0) continue;
        const remaining = kept.filter((t) => !dead.has(t));
        if (remaining.length >= 1) {
          keptByLesson.set(id, remaining);
          removedDeadGlobs.push({ id, removedTriggers: deadInLesson, keptCount: remaining.length });
        } else {
          unreachableLessons.push(id);
        }
      }
      unreachableLessons.sort();
    }
  }

  const live = new Set<string>();
  for (const kept of keptByLesson.values()) for (const t of kept) live.add(t);
  const removedTriggerIds = Object.keys(graph.triggers)
    .filter((t) => !live.has(t))
    .sort();

  // Topic GC: a topic referenced by NO lesson (any status) is dead weight —
  // `validate` only warns (ORPHAN_TOPIC); prune actually removes it. Trigger
  // trimming never changes topic references, so this is independent of `live`.
  const referencedTopics = new Set<string>();
  for (const lesson of Object.values(graph.lessons)) {
    for (const topic of lesson.topics) referencedTopics.add(topic);
  }
  const removedTopicIds = Object.keys(graph.topics)
    .filter((t) => !referencedTopics.has(t))
    .sort();

  return {
    removedTriggerIds,
    removedTopicIds,
    trimmedLessons,
    removedDeadGlobs,
    unreachableLessons,
    cap,
  };
}

/** Apply a {@link planPrune} result to a loaded graph in place. */
export function applyPruneToGraph(graph: LessonsGraph, plan: PrunePlan): void {
  // 1. Detach per-lesson triggers (cap trims + dead-glob GC). A removed trigger
  //    may survive in the table when another active lesson still references it,
  //    so this only edits the lesson; the table GC in step 3 cleans up orphans.
  for (const trim of [...plan.trimmedLessons, ...(plan.removedDeadGlobs ?? [])]) {
    const lesson = graph.lessons[trim.id];
    if (lesson === undefined) continue;
    const drop = new Set(trim.removedTriggers);
    graph.lessons[trim.id] = { ...lesson, triggers: lesson.triggers.filter((t) => !drop.has(t)) };
  }

  // 2. Drop orphan topics (referenced by zero lessons). Independent of trigger
  //    pruning, so it runs unconditionally.
  for (const topicId of plan.removedTopicIds) delete graph.topics[topicId];

  // 3. Remove dead triggers from the table and strip every remaining reference
  //    (incl. superseded/deprecated lessons) so no dangling reference survives.
  const dead = new Set(plan.removedTriggerIds);
  if (dead.size === 0) return;
  for (const [id, lesson] of Object.entries(graph.lessons)) {
    if (lesson.triggers.some((t) => dead.has(t))) {
      graph.lessons[id] = { ...lesson, triggers: lesson.triggers.filter((t) => !dead.has(t)) };
    }
  }
  for (const t of dead) delete graph.triggers[t];
}

/** True when a plan would change nothing (unreachable lessons are report-only). */
export function isEmptyPrunePlan(plan: PrunePlan): boolean {
  return (
    plan.removedTriggerIds.length === 0 &&
    plan.removedTopicIds.length === 0 &&
    plan.trimmedLessons.length === 0 &&
    plan.removedDeadGlobs.length === 0
  );
}
