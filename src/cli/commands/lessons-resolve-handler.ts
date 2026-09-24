import { LESSONS_GRAPH_PATH } from '../../lessons/graph-store.js';
import { resolveLessonsConflict } from '../../lessons/resolve-conflict.js';
import type { LessonsCommandResult, LessonsResolveData } from './lessons-types.js';

const EMPTY: LessonsResolveData = {
  source: 'index',
  path: LESSONS_GRAPH_PATH,
  lessonCount: 0,
  onlyOurs: 0,
  onlyTheirs: 0,
  introduced: [],
  baseKnown: true,
  nextStep: null,
};

/** `agentsmesh lessons resolve` — union a conflicted lessons.json; staging stays with the user. */
export async function doResolve(projectRoot: string): Promise<LessonsCommandResult> {
  const outcome = await resolveLessonsConflict(projectRoot);
  if (!outcome.ok) return { subcommand: 'resolve', exitCode: 1, error: outcome.error, data: EMPTY };
  return {
    subcommand: 'resolve',
    exitCode: 0,
    data: { ...outcome.resolved, path: LESSONS_GRAPH_PATH },
  };
}
