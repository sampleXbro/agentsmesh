import { union } from './add-helpers.js';
import type { LessonsGraph } from './graph-schema.js';
import { mutateLessonsGraph } from './mutate.js';

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
 * the loser `superseded` with `supersededBy` pointing at the keeper.
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
    throw new Error(`Cannot merge lesson "${loserId}" into itself.`);
  }
  const loser = graph.lessons[loserId];
  if (loser === undefined) throw new Error(`Unknown lesson "${loserId}".`);
  const keeper = graph.lessons[keeperId];
  if (keeper === undefined) throw new Error(`Unknown lesson "${keeperId}".`);

  if (keeper.status !== 'active') {
    throw new Error(`Keeper "${keeperId}" is not active (status: ${keeper.status}).`);
  }
  if (loser.status !== 'active') {
    throw new Error(`Loser "${loserId}" is already ${loser.status}; nothing to merge.`);
  }

  graph.lessons[keeperId] = {
    ...keeper,
    triggers: union(keeper.triggers, loser.triggers),
    topics: union(keeper.topics, loser.topics),
    evidence: union(keeper.evidence, loser.evidence),
  };
  graph.lessons[loserId] = { ...loser, status: 'superseded', supersededBy: keeperId };
  return { loserId, keeperId };
}

export type { LessonsGraph };
