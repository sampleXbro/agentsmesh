import { mayStageLessonsGraph } from './git-staging-command.js';
import { graphFilePath, loadLessonsGraphResilient } from './graph-store.js';
import { problemFromLoadAndGit } from './graph-problem.js';

/**
 * Warns an agent that is about to stage or commit while lessons.json is still
 * in a git merge conflict. A merge driver git could not start (not on PATH, a
 * GUI client) leaves this branch's file with no markers and git still holding
 * it unmerged, so `git add -A && git commit` drops the other branch's lessons.
 * The command is checked first and git runs only for a command that can stage
 * the graph: the hook fires on every tool call. Never throws.
 */
export function mergeStagingNotice(
  projectRoot: string,
  start: string,
  command: string | undefined,
): string | null {
  if (command === undefined || !mayStageLessonsGraph(command, start, graphFilePath(projectRoot))) {
    return null;
  }
  try {
    const problem = problemFromLoadAndGit(projectRoot, loadLessonsGraphResilient(projectRoot));
    if (problem?.kind !== 'conflict') return null;
    return `agentsmesh lessons: do not stage or commit yet. ${problem.message}`;
  } catch {
    return null;
  }
}
