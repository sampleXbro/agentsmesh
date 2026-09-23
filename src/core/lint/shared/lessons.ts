/**
 * Lint guard for the `.agentsmesh/lessons/` subsystem.
 *
 * Validates the JSON graph (`lessons.json`) against the canonical schema and
 * integrity rules, then verifies the procedural rule paragraph is present in
 * `_root.md`.
 *
 * Project-scope only — lessons live in the project tree, never under `~`.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LESSONS_GRAPH_PATH, loadLessonsGraph } from '../../../lessons/graph-store.js';
import { lessonsPaths } from '../../../lessons/paths.js';
import { listProjectFiles } from '../../../lessons/project-files.js';
import { validateLessonsGraph } from '../../../lessons/validate.js';
import type { TargetLayoutScope } from '../../../targets/catalog/target-descriptor.js';
import type { LintDiagnostic } from '../../types.js';

const LESSONS_TARGET = 'lessons';
const ROOT_RULE_REL = '.agentsmesh/rules/_root.md';
const LESSONS_HEADING = /^## Lessons \(/m;

export function lintLessonsSubsystem(
  projectRoot: string,
  scope: TargetLayoutScope,
): LintDiagnostic[] {
  if (scope === 'global') return [];
  const paths = lessonsPaths(projectRoot);
  if (!existsSync(paths.graph)) return [];

  const out: LintDiagnostic[] = [];

  let graph;
  try {
    // existsSync above guarantees the file is present, so this never returns null.
    graph = loadLessonsGraph(projectRoot);
  } catch (err) {
    return [
      diag(
        'error',
        LESSONS_GRAPH_PATH,
        `lessons.json failed to load: ${err instanceof Error ? err.message : String(err)}`,
      ),
    ];
  }

  const knownPaths = listProjectFiles(projectRoot) ?? undefined;
  const report = validateLessonsGraph(graph, { knownPaths });
  for (const finding of report.findings) {
    out.push(diag(finding.level, LESSONS_GRAPH_PATH, `[${finding.code}] ${finding.message}`));
  }

  const rootRuleAbs = join(projectRoot, ROOT_RULE_REL);
  const rootRuleBody = existsSync(rootRuleAbs) ? readFileSync(rootRuleAbs, 'utf8') : '';
  if (!LESSONS_HEADING.test(rootRuleBody)) {
    out.push(
      diag(
        'warning',
        ROOT_RULE_REL,
        'lessons procedural rule ("## Lessons (...)") is missing from _root.md — recall/capture enforcement will not fire.',
      ),
    );
  }

  return out;
}

function diag(level: 'error' | 'warning', file: string, message: string): LintDiagnostic {
  return { level, file, target: LESSONS_TARGET, message };
}
