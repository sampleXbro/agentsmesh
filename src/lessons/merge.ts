import { union } from './add-helpers.js';
import { InactiveLessonError, SelfMergeError, UnknownLessonError } from './curation-errors.js';
import type { LessonsGraph } from './graph-schema.js';
import { mutateLessonsGraph } from './mutate.js';
import { settleLineage } from './retire-lineage.js';

export interface MergeLessonsResult {
  readonly loserId: string;
  readonly keeperId: string;
}

export interface MergeLessonsOptions {
  readonly retries?: number;
}

/**
 * Fold a duplicate lesson (`loserId`) into its canonical twin (`keeperId`):
 * union the loser's triggers, topics, and evidence onto the keeper, then mark
 * the loser `superseded` with `supersededBy` pointing at the keeper. The keeper
 * also inherits an always-on scope, the loser's rationale when it has none, and
 * the earlier `createdAt`. Lessons already merged into the loser are re-pointed
 * at the keeper, so the chain stays one hop deep.
 *
 * Unioning reachability BEFORE superseding is the whole point — a raw
 * supersede would silently drop the keeper out of recall for queries that only
 * matched the loser's (often different-topic) triggers.
 */
export async function mergeLessons(
  projectRoot: string,
  loserId: string,
  keeperId: string,
  options: MergeLessonsOptions = {},
): Promise<MergeLessonsResult> {
  return mutateLessonsGraph(projectRoot, (graph) => mergeInto(graph, loserId, keeperId), {
    retries: options.retries,
  });
}

function mergeInto(graph: LessonsGraph, loserId: string, keeperId: string): MergeLessonsResult {
  if (loserId === keeperId) {
    throw new SelfMergeError(loserId);
  }
  const loser = graph.lessons[loserId];
  if (loser === undefined) throw new UnknownLessonError(loserId, 'quoted');
  const keeper = graph.lessons[keeperId];
  if (keeper === undefined) throw new UnknownLessonError(keeperId, 'quoted');

  if (keeper.status !== 'active') throw new InactiveLessonError('keeper', keeperId, keeper.status);
  if (loser.status !== 'active') throw new InactiveLessonError('loser', loserId, loser.status);

  settleLineage(graph, loserId, keeperId);
  graph.lessons[keeperId] = {
    ...keeper,
    triggers: union(keeper.triggers, loser.triggers),
    topics: union(keeper.topics, loser.topics),
    evidence: union(keeper.evidence, loser.evidence),
    createdAt: keeper.createdAt <= loser.createdAt ? keeper.createdAt : loser.createdAt,
    ...(keeper.rationale === undefined && loser.rationale !== undefined
      ? { rationale: loser.rationale }
      : {}),
    ...(loser.scope === 'always' ? { scope: 'always' as const } : {}),
  };
  graph.lessons[loserId] = { ...loser, status: 'superseded', supersededBy: keeperId };
  return { loserId, keeperId };
}

export type { LessonsGraph };
