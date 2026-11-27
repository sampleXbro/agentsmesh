import { problemFromLoad } from '../../lessons/graph-problem.js';
import { loadLessonsGraphResilient } from '../../lessons/graph-store.js';

export interface RecallProblems {
  readonly corrupt?: boolean;
  readonly newerVersion?: number;
  readonly migrationError?: string;
}

/** Same wording as the CLI's recall warning for a legacy store that did not migrate. */
function migrationFailure(error: string): string {
  return (
    'recall returned no lessons: the legacy lessons store (.agentsmesh/lessons/index.yaml) ' +
    `could not be migrated: ${error.replace(/\s+$/, '')} Fix it, then run ` +
    '`agentsmesh lessons import-md`.'
  );
}

/**
 * Why recall returned nothing when it could not read the graph, else undefined.
 * Recall degrades to empty rather than throwing, so the reason goes to stderr
 * (stdout is the MCP protocol channel) and into the result: an MCP client cannot
 * see stderr. No git here: recall runs before every edit.
 */
export function recallWarning(root: string, recall: RecallProblems): string | undefined {
  const unreadable = recall.corrupt === true || recall.newerVersion !== undefined;
  const problem = unreadable ? problemFromLoad(root, loadLessonsGraphResilient(root)) : null;
  let warning: string | undefined;
  if (problem !== null) warning = `recall returned no lessons: ${problem.message}`;
  else if (recall.migrationError !== undefined) warning = migrationFailure(recall.migrationError);
  if (warning !== undefined) process.stderr.write(`agentsmesh: ${warning}\n`);
  return warning;
}
