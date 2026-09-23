import { problemFromLoad, type GraphProblemKind } from '../../lessons/graph-problem.js';
import type { LessonsGraph } from '../../lessons/graph-schema.js';
import { loadLessonsGraphResilient } from '../../lessons/graph-store.js';
import { LessonsWriteRefusedError } from '../../lessons/mutate.js';
import { lessonsRootOf, type McpContext } from '../context.js';
import { McpError, redactAbsolutePaths } from '../errors.js';

/** The lessons root a write tool may change; outside any project there is none. */
export function writableLessonsRoot(ctx: McpContext, tool: string): string {
  const root = lessonsRootOf(ctx);
  if (root === null) {
    throw new McpError(
      'NO_PROJECT',
      `${tool}: no agentsmesh project here — run \`agentsmesh init --lessons\` in your project.`,
    );
  }
  return root;
}

/** Same finding codes as `lessons validate`. */
const PROBLEM_CODE: Record<GraphProblemKind, string> = {
  conflict: 'MERGE_CONFLICT',
  corrupt: 'CORRUPT_GRAPH',
  'schema-invalid': 'SCHEMA_INVALID',
  'newer-version': 'NEWER_GRAPH_VERSION',
};

/**
 * The graph at `root`, or null when there is none. A graph that cannot be read
 * fails with the shared diagnosis (merge conflict, bad JSON or schema, newer
 * version) instead of parser text. Runs no git, so it is cheap on every call.
 */
export function readableGraph(root: string): LessonsGraph | null {
  const load = loadLessonsGraphResilient(root);
  if (load.status === 'ok') return load.graph;
  const problem = problemFromLoad(root, load);
  if (problem === null) return null;
  throw new McpError('VALIDATION_FAILED', redactAbsolutePaths(problem.message), {
    code: PROBLEM_CODE[problem.kind],
  });
}

interface RefusedFinding {
  readonly code: string;
  readonly message: string;
}

function refusedFindings(err: unknown): readonly RefusedFinding[] | null {
  return err instanceof LessonsWriteRefusedError ? err.findings : null;
}

/**
 * A write the graph validator refused is the caller's input to fix, so it is
 * VALIDATION_FAILED with the finding codes in `details` — not the IO_ERROR
 * catch-all. Null for any other error.
 */
export function writeRefusalError(tool: string, err: unknown): McpError | null {
  const findings = refusedFindings(err);
  if (findings === null) return null;
  const codes = [...new Set(findings.map((f) => f.code))];
  const text = findings.map((f) => `${f.code}: ${f.message}`).join(' ');
  return new McpError(
    'VALIDATION_FAILED',
    redactAbsolutePaths(`${tool}: refused, nothing was written. ${text}`),
    { code: codes[0], codes },
  );
}
