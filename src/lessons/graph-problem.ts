import { ZodError } from 'zod';
import { readTextOrEmpty } from '../utils/filesystem/fs.js';
import { hasConflictMarkers } from './conflict-markers.js';
import { CURRENT_GRAPH_VERSION, type LessonsGraph } from './graph-schema.js';
import {
  graphFilePath,
  LESSONS_GRAPH_PATH,
  loadLessonsGraphResilient,
  stableStringify,
  type ResilientGraphLoad,
} from './graph-store.js';
import { readIndexStages, type ConflictTexts } from './merge-stages.js';
import { parseGraphText, unionGraphTexts } from './merge-sides.js';

/**
 * Why an existing lessons graph cannot be read, with the one safe next step.
 * Shared by `check`, `lessons validate`, recall warnings and `generate`, so a
 * merge conflict is never mistaken for corruption and nobody is told to
 * `git checkout` away a teammate's lessons without keeping a copy first.
 */

export type GraphProblemKind = 'conflict' | 'corrupt' | 'schema-invalid' | 'newer-version';

export interface GraphProblem {
  readonly kind: GraphProblemKind;
  readonly message: string;
}

const MAX_LISTED_ISSUES = 3;

const KEEP_A_COPY = `Keep a copy first (e.g. \`cp ${LESSONS_GRAPH_PATH} lessons.json.bak\`), then`;
const OR_RESTORE =
  `or restore the last committed graph with \`git checkout -- ${LESSONS_GRAPH_PATH}\` ` +
  '(this drops lessons that were not committed yet).';

/** True when the graph file holds unresolved git merge conflict markers. */
export function graphHasConflictMarkers(projectRoot: string): boolean {
  return hasConflictMarkers(readTextOrEmpty(graphFilePath(projectRoot)));
}

function schemaIssues(error: ZodError): string {
  const listed = error.issues.slice(0, MAX_LISTED_ISSUES).map((issue) => {
    const where = issue.path.length === 0 ? 'top level' : issue.path.map(String).join('.');
    return `${where}: ${issue.message}`;
  });
  const more = error.issues.length - listed.length;
  return more > 0 ? `${listed.join('; ')}; and ${more} more` : listed.join('; ');
}

/** Diagnose a graph that failed to load: an unresolved merge, a schema failure, or bad JSON. */
export function describeCorruptGraph(projectRoot: string, error: Error): GraphProblem {
  if (graphHasConflictMarkers(projectRoot)) {
    return {
      kind: 'conflict',
      message:
        `${LESSONS_GRAPH_PATH} has unresolved git merge conflict markers (a merge conflict), ` +
        'so no lesson can be read. Run `agentsmesh lessons resolve` to combine the lessons ' +
        `from both branches, then \`git add ${LESSONS_GRAPH_PATH}\`.`,
    };
  }
  if (error instanceof ZodError) {
    return {
      kind: 'schema-invalid',
      message:
        `${LESSONS_GRAPH_PATH} does not match the lessons schema (${schemaIssues(error)}). ` +
        `${KEEP_A_COPY} fix those fields by hand, ${OR_RESTORE}`,
    };
  }
  return {
    kind: 'corrupt',
    message:
      `${LESSONS_GRAPH_PATH} could not be parsed (${error.message}). ` +
      `${KEEP_A_COPY} repair the JSON by hand, ${OR_RESTORE}`,
  };
}

function newerGraphProblem(version: number): GraphProblem {
  return {
    kind: 'newer-version',
    message:
      `${LESSONS_GRAPH_PATH} is version ${version}, newer than this agentsmesh supports ` +
      `(${CURRENT_GRAPH_VERSION}). Upgrade agentsmesh to read it.`,
  };
}

/**
 * The problem behind a resilient load, or null when the graph is absent or
 * reads fine. Never runs git, so recall can call it on every edit.
 */
export function problemFromLoad(
  projectRoot: string,
  load: ResilientGraphLoad,
): GraphProblem | null {
  if (load.status === 'corrupt') return describeCorruptGraph(projectRoot, load.error);
  if (load.status === 'newer-version') return newerGraphProblem(load.version);
  return null;
}

const UNMERGED_PROBLEM: GraphProblem = {
  kind: 'conflict',
  message:
    `git still has ${LESSONS_GRAPH_PATH} in a merge conflict, and the file does not hold the ` +
    'lessons from both branches (the lessons merge driver may not have run). Run ' +
    `\`agentsmesh lessons resolve\` BEFORE \`git add ${LESSONS_GRAPH_PATH}\`, or the other ` +
    "branch's lessons are dropped.",
};

function sameGraph(text: string | null, graph: LessonsGraph): boolean {
  const parsed = text === null ? null : parseGraphText(text);
  return parsed?.ok === true && stableStringify(parsed.graph) === stableStringify(graph);
}

/**
 * A git merge the file does not finish yet: git holds the graph unmerged and
 * the file lacks a lesson (or a lesson edit) that `lessons resolve` would keep.
 * A merge driver git could not start leaves exactly this: one branch's file,
 * no markers. When a side is unreadable there is no union to compare with, so
 * only a file still identical to one side counts.
 */
function missesMergeSide(stages: ConflictTexts, graph: LessonsGraph): boolean {
  const union = unionGraphTexts(stages.base, stages.ours, stages.theirs);
  if (!union.ok) return sameGraph(stages.ours, graph) || sameGraph(stages.theirs, graph);
  return Object.entries(union.merged.lessons).some(([id, kept]) => {
    const own = graph.lessons[id];
    return own === undefined || stableStringify(own) !== stableStringify(kept);
  });
}

/**
 * {@link problemFromLoad}, plus git's view of a graph that reads fine but is
 * still in an unfinished merge. Runs git, so it is for validate, check and
 * generate, not for recall.
 */
export function problemFromLoadAndGit(
  projectRoot: string,
  load: ResilientGraphLoad,
): GraphProblem | null {
  if (load.status !== 'ok') return problemFromLoad(projectRoot, load);
  let stages: ConflictTexts | null;
  try {
    stages = readIndexStages(projectRoot);
  } catch {
    return UNMERGED_PROBLEM;
  }
  return stages !== null && missesMergeSide(stages, load.graph) ? UNMERGED_PROBLEM : null;
}

/** Null when the project has no lessons graph or it reads fine and is not mid-merge. */
export function lessonsGraphProblem(projectRoot: string): GraphProblem | null {
  return problemFromLoadAndGit(projectRoot, loadLessonsGraphResilient(projectRoot));
}
