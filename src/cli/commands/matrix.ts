/**
 * agentsmesh matrix — show compatibility matrix for current config.
 */

import { parseTargetsFlag } from '../flags.js';
import { loadProjectContext } from '../../public/engine.js';
import { buildCompatibilityMatrix, formatVerboseDetails } from '../../core/matrix/matrix.js';
import type { MatrixData } from '../command-result.js';

export interface MatrixCommandResult {
  exitCode: number;
  data: MatrixData;
  verboseDetails?: string;
}

/**
 * Run the matrix command.
 * @param flags - CLI flags (targets, verbose)
 * @param projectRoot - Project root (default process.cwd())
 */
export async function runMatrix(
  flags: Record<string, string | boolean>,
  projectRoot?: string,
): Promise<MatrixCommandResult> {
  const root = projectRoot ?? process.cwd();
  const scope = flags.global === true ? 'global' : 'project';
  const targetFilter = parseTargetsFlag(flags.targets);
  const { config, canonical } = await loadProjectContext(root, { scope });

  const targets = targetFilter ?? [...config.targets, ...(config.pluginTargets ?? [])];
  const rows = buildCompatibilityMatrix(config, canonical, scope);
  const verboseDetails = formatVerboseDetails(canonical);

  return {
    exitCode: 0,
    data: {
      targets,
      features: rows.map((r) => ({ name: r.feature, support: r.support })),
    },
    verboseDetails: verboseDetails || undefined,
  };
}
