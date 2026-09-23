import { readFileSync } from 'node:fs';
import { hasConflictMarkers } from './conflict-markers.js';
import { CURRENT_GRAPH_VERSION } from './graph-schema.js';
import {
  graphFilePath,
  loadLessonsGraphResilient,
  type ResilientGraphLoad,
} from './graph-store.js';
import { LESSONS_GRAPH_PATH } from './merge-sides.js';

/**
 * Why an existing lessons graph cannot be read, with the one safe next step.
 * Shared by `check`, `lessons validate`, recall warnings and `generate`, so a
 * merge conflict is never mistaken for corruption and nobody is told to
 * `git checkout` away a teammate's lessons without keeping a copy first.
 */

export type GraphProblemKind = 'conflict' | 'corrupt' | 'newer-version';

export interface GraphProblem {
  readonly kind: GraphProblemKind;
  readonly message: string;
}

function readRaw(projectRoot: string): string {
  try {
    return readFileSync(graphFilePath(projectRoot), 'utf8');
  } catch {
    return '';
  }
}

/** Diagnose a graph that failed to parse: an unresolved merge, or real corruption. */
export function describeCorruptGraph(projectRoot: string, error: Error): GraphProblem {
  if (hasConflictMarkers(readRaw(projectRoot))) {
    return {
      kind: 'conflict',
      message:
        `${LESSONS_GRAPH_PATH} has unresolved git merge conflict markers (a merge conflict), ` +
        'so no lesson can be read. Run `agentsmesh lessons resolve` to combine the lessons ' +
        `from both branches, then \`git add ${LESSONS_GRAPH_PATH}\`.`,
    };
  }
  return {
    kind: 'corrupt',
    message:
      `${LESSONS_GRAPH_PATH} could not be parsed (${error.message}). Keep a copy first ` +
      `(e.g. \`cp ${LESSONS_GRAPH_PATH} lessons.json.bak\`), then repair the JSON by hand, or ` +
      `restore the last committed graph with \`git checkout -- ${LESSONS_GRAPH_PATH}\` ` +
      '(this drops lessons that were not committed yet).',
  };
}

export function newerGraphProblem(version: number): GraphProblem {
  return {
    kind: 'newer-version',
    message:
      `${LESSONS_GRAPH_PATH} is version ${version}, newer than this agentsmesh supports ` +
      `(${CURRENT_GRAPH_VERSION}). Upgrade agentsmesh to read it.`,
  };
}

/** The problem behind a resilient load, or null when the graph is absent or fine. */
export function problemFromLoad(
  projectRoot: string,
  load: ResilientGraphLoad,
): GraphProblem | null {
  if (load.status === 'corrupt') return describeCorruptGraph(projectRoot, load.error);
  if (load.status === 'newer-version') return newerGraphProblem(load.version);
  return null;
}

/** Null when the project has no lessons graph or it reads fine. */
export function lessonsGraphProblem(projectRoot: string): GraphProblem | null {
  return problemFromLoad(projectRoot, loadLessonsGraphResilient(projectRoot));
}
