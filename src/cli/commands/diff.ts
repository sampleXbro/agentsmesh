/**
 * agentsmesh diff — show what would change on the next generate.
 */

import { parseTargetsFlag } from '../flags.js';
import { loadProjectContext } from '../../public/engine.js';
import { generate as runEngine } from '../../core/generate/engine.js';
import { computeDiff } from '../../core/differ.js';
import type { DiffData } from '../command-result.js';

export interface DiffCommandResult {
  exitCode: number;
  data: DiffData;
}

/**
 * Run the diff command.
 * @param flags - CLI flags (targets)
 * @param projectRoot - Project root (default process.cwd())
 */
export async function runDiff(
  flags: Record<string, string | boolean>,
  projectRoot?: string,
): Promise<DiffCommandResult> {
  const root = projectRoot ?? process.cwd();
  const scope = flags.global === true ? 'global' : 'project';
  const targetFilter = parseTargetsFlag(flags.targets);
  const {
    config,
    canonical,
    projectRoot: rootBase,
  } = await loadProjectContext(root, {
    scope,
  });

  const results = await runEngine({
    config,
    canonical,
    projectRoot: rootBase,
    scope,
    targetFilter,
  });

  if (results.length === 0) {
    return {
      exitCode: 0,
      data: {
        files: [],
        patches: [],
        summary: { created: 0, updated: 0, unchanged: 0, deleted: 0 },
      },
    };
  }

  const { diffs, summary } = computeDiff(results);
  const files = results
    .filter((r) => r.status !== 'unchanged' && r.status !== 'skipped')
    .map((r) => ({
      path: r.path,
      target: r.target,
      status: r.status as 'created' | 'updated' | 'deleted',
    }));

  return {
    exitCode: 0,
    data: {
      files,
      patches: diffs.map((d) => ({ path: d.path, patch: d.patch })),
      summary: {
        created: summary.new,
        updated: summary.updated,
        unchanged: summary.unchanged,
        deleted: summary.deleted,
      },
    },
  };
}
