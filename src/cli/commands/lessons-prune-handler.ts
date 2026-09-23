import { emptyGraph } from '../../lessons/graph-schema.js';
import { tryLoadLessonsGraph } from '../../lessons/graph-store.js';
import { mutateLessonsGraph } from '../../lessons/mutate.js';
import { listProjectFiles } from '../../lessons/project-files.js';
import {
  applyPruneToGraph,
  isEmptyPrunePlan,
  planPrune,
  type PrunePlan,
  type PruneOptions,
} from '../../lessons/prune.js';
import { errorResult, numberFlag, type LessonsFlags } from './lessons-helpers.js';
import type { LessonsCommandResult, LessonsPruneData } from './lessons-types.js';

function toPruneData(plan: PrunePlan, applied: boolean): LessonsPruneData {
  return {
    applied,
    cap: plan.cap,
    removedTriggerIds: plan.removedTriggerIds,
    removedTopicIds: plan.removedTopicIds,
    trimmedLessons: plan.trimmedLessons.map((t) => ({
      id: t.id,
      removedCount: t.removedTriggers.length,
      keptCount: t.keptCount,
    })),
    removedDeadGlobs: plan.removedDeadGlobs.map((t) => ({
      id: t.id,
      removedCount: t.removedTriggers.length,
      keptCount: t.keptCount,
    })),
    unreachableLessons: plan.unreachableLessons,
  };
}

/**
 * `lessons prune` — curate the graph. Dry-run by default (computes the plan,
 * writes nothing); `--apply` routes through the locked transaction so the
 * curation is atomic and validated before persistence. `--cap <n>` overrides
 * the per-lesson trigger cap.
 */
export async function doPrune(
  flags: LessonsFlags,
  projectRoot: string,
): Promise<LessonsCommandResult> {
  const cap = numberFlag(flags, 'cap');
  if (cap !== null && (!Number.isInteger(cap) || cap < 1)) {
    return errorResult('prune', 'Invalid --cap: expected a positive integer.', 2);
  }
  // Supply the working-tree file list so prune also GCs dead `file_glob` triggers
  // (without it, prune is trim-and-orphan only, exactly as before).
  const knownPaths = listProjectFiles(projectRoot) ?? undefined;
  const options: PruneOptions = {
    ...(cap !== null ? { cap } : {}),
    ...(knownPaths ? { knownPaths } : {}),
  };

  // The dispatcher already auto-migrated any legacy store before we get here.
  if (flags.apply !== true) {
    const graph = tryLoadLessonsGraph(projectRoot) ?? emptyGraph();
    return {
      subcommand: 'prune',
      exitCode: 0,
      data: toPruneData(planPrune(graph, options), false),
    };
  }
  // Nothing to curate — skip the locked transaction so an empty apply never
  // takes the lock or rewrites the graph file for a no-op.
  const preGraph = tryLoadLessonsGraph(projectRoot) ?? emptyGraph();
  const prePlan = planPrune(preGraph, options);
  if (isEmptyPrunePlan(prePlan)) {
    return { subcommand: 'prune', exitCode: 0, data: toPruneData(prePlan, true) };
  }
  const data = await mutateLessonsGraph(projectRoot, (graph) => {
    const plan = planPrune(graph, options);
    applyPruneToGraph(graph, plan);
    return toPruneData(plan, true);
  });
  return { subcommand: 'prune', exitCode: 0, data };
}
