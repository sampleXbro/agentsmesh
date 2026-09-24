import { emptyGraph } from '../../lessons/graph-schema.js';
import { problemFromLoadAndGit, type GraphProblemKind } from '../../lessons/graph-problem.js';
import { loadLessonsGraphResilient } from '../../lessons/graph-store.js';
import { listProjectFiles } from '../../lessons/project-files.js';
import { validateLessonsGraph } from '../../lessons/validate.js';
import { collectHealthFindings } from '../../lessons/validate-health.js';
import type { LessonsCommandResult, LessonsValidateData } from './lessons-types.js';

const PROBLEM_CODE: Record<GraphProblemKind, string> = {
  conflict: 'MERGE_CONFLICT',
  corrupt: 'CORRUPT_GRAPH',
  'schema-invalid': 'SCHEMA_INVALID',
  'newer-version': 'NEWER_GRAPH_VERSION',
};

/** One-line failure summary; the `--json` envelope reports it as the error. */
function errorSummary(findings: LessonsValidateData['findings']): string | undefined {
  const errors = findings.filter((f) => f.level === 'error');
  if (errors.length === 0) return undefined;
  const codes = [...new Set(errors.map((f) => f.code))].join(', ');
  return `Lessons graph has ${errors.length} error${errors.length === 1 ? '' : 's'} (${codes}).`;
}

function validateResult(data: LessonsValidateData): LessonsCommandResult {
  const error = errorSummary(data.findings);
  return {
    subcommand: 'validate',
    exitCode: data.ok ? 0 : 1,
    ...(error === undefined ? {} : { error }),
    data,
  };
}

export function doValidate(projectRoot: string): LessonsCommandResult {
  // Name the cause (merge conflict, bad JSON or schema, newer schema) and the safe next step.
  const load = loadLessonsGraphResilient(projectRoot);
  const problem = problemFromLoadAndGit(projectRoot, load);
  if (problem !== null) {
    return validateResult({
      ok: false,
      findings: [{ level: 'error', code: PROBLEM_CODE[problem.kind], message: problem.message }],
    });
  }
  const graph = load.graph ?? emptyGraph();
  // Supply the working-tree file list so dead-`file_glob` triggers surface; null
  // (no git, walk failed) → undefined → the liveness check is skipped, never a
  // false "everything is dead".
  const knownPaths = listProjectFiles(projectRoot) ?? undefined;
  const report = validateLessonsGraph(graph, { knownPaths });
  // Log-derived health findings are WARNING level and computed here, never in
  // validateLessonsGraph (also the write barrier), so they cannot gate a write.
  const findings = [...report.findings, ...collectHealthFindings(projectRoot, graph)];
  return validateResult({ ok: report.ok, findings });
}
