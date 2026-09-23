import { emptyGraph } from '../../lessons/graph-schema.js';
import { problemFromLoad, type GraphProblemKind } from '../../lessons/graph-problem.js';
import { loadLessonsGraphResilient } from '../../lessons/graph-store.js';
import { listProjectFiles } from '../../lessons/project-files.js';
import { validateLessonsGraph } from '../../lessons/validate.js';
import { collectHealthFindings } from '../../lessons/validate-health.js';
import type { LessonsCommandResult, LessonsValidateData } from './lessons-types.js';

const PROBLEM_CODE: Record<GraphProblemKind, string> = {
  conflict: 'MERGE_CONFLICT',
  corrupt: 'CORRUPT_GRAPH',
  'newer-version': 'NEWER_GRAPH_VERSION',
};

export function doValidate(projectRoot: string): LessonsCommandResult {
  // Name the cause (merge conflict, corruption, newer schema) and the safe next step.
  const load = loadLessonsGraphResilient(projectRoot);
  const problem = problemFromLoad(projectRoot, load);
  if (problem !== null) {
    const data: LessonsValidateData = {
      ok: false,
      findings: [{ level: 'error', code: PROBLEM_CODE[problem.kind], message: problem.message }],
    };
    return { subcommand: 'validate', exitCode: 1, data };
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
  const data: LessonsValidateData = { ok: report.ok, findings };
  return { subcommand: 'validate', exitCode: report.ok ? 0 : 1, data };
}
