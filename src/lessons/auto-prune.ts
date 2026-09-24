import { tryLoadLessonsGraph } from './graph-store.js';
import { mutateLessonsGraph } from './mutate.js';
import { applyPruneToGraph, isEmptyPrunePlan, planPrune } from './prune.js';
import { configFlag } from './telemetry.js';

/**
 * Opt-in automatic graph hygiene. When `.agentsmesh/lessons/config.json` carries
 * `"autoPrune": true`, the capture path runs the GC-only subset of `prune` after
 * a successful add — orphan triggers/topics removed and non-stranding dead globs
 * detached, NEVER an active lesson dropped or a within-cap lesson trimmed. A glob
 * is dead only when git history renamed or deleted its path (see
 * `missingGlobState`): a glob for a file not created yet, ignored build output, a
 * non-git project or a capped walk is never detached. It is
 * the safe half of `lessons prune`, so it can run unattended: every change is
 * git-reversible (lessons.json is the committed source of truth) and a lesson is
 * never made unrecallable.
 *
 * Off by default — the manual `lessons prune` (with over-cap trimming) stays the
 * deliberate, reviewed curation path.
 */

/** True when the project config opts into automatic GC-only pruning. */
export function isAutoPruneEnabled(projectRoot: string): boolean {
  return configFlag(projectRoot, 'autoPrune') === true;
}

export interface AutoPruneSummary {
  readonly removedTriggers: number;
  readonly removedTopics: number;
  readonly detachedDeadGlobs: number;
}

/**
 * Run the GC-only prune when enabled; a no-op (returns `null`) when disabled or
 * when there is nothing to clean. `knownPaths` (the working-tree file list the
 * capture path already computed, with its git evidence) enables dead-glob
 * detachment; `undefined` (no walk, or the walk hit its cap) GCs orphans only.
 * Best-effort: a corrupt/absent graph yields `null`, never a throw,
 * so auto-prune can never break the capture it follows.
 */
export async function maybeAutoPrune(
  projectRoot: string,
  knownPaths: ReadonlySet<string> | undefined,
): Promise<AutoPruneSummary | null> {
  if (!isAutoPruneEnabled(projectRoot)) return null;
  // Cheap unlocked pre-check so we never open a transaction (and rewrite the
  // file) when there is nothing to prune — the common case after an add.
  const preview = tryLoadLessonsGraph(projectRoot);
  if (preview === null) return null;
  if (isEmptyPrunePlan(planPrune(preview, { trimOverCap: false, knownPaths }))) return null;

  let summary: AutoPruneSummary = { removedTriggers: 0, removedTopics: 0, detachedDeadGlobs: 0 };
  await mutateLessonsGraph(projectRoot, (graph) => {
    // Re-plan under the lock (the graph may have moved since the pre-check).
    const plan = planPrune(graph, { trimOverCap: false, knownPaths });
    if (isEmptyPrunePlan(plan)) return;
    applyPruneToGraph(graph, plan);
    summary = {
      removedTriggers: plan.removedTriggerIds.length,
      removedTopics: plan.removedTopicIds.length,
      detachedDeadGlobs: plan.removedDeadGlobs.reduce((n, t) => n + t.removedTriggers.length, 0),
    };
  });
  const total = summary.removedTriggers + summary.removedTopics + summary.detachedDeadGlobs;
  return total > 0 ? summary : null;
}
