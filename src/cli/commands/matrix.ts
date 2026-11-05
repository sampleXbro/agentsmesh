/**
 * agentsmesh matrix — show compatibility matrix for current config.
 */

import { parseTargetsFlag } from '../flags.js';
import { loadProjectContext } from '../../public/engine.js';
import { buildCompatibilityMatrix, formatVerboseDetails } from '../../core/matrix/matrix.js';
import type { MatrixData } from '../command-result.js';
import type { ValidatedConfig } from '../../config/core/schema.js';
import type { CanonicalFiles } from '../../core/types.js';

export interface MatrixCommandResult {
  exitCode: number;
  data: MatrixData;
  verboseDetails?: string;
}

/**
 * Run the matrix command.
 * @param flags - CLI flags (targets, verbose)
 * @param projectRoot - Project root (default process.cwd())
 * @param loaded - Config and canonical files already loaded (generate passes its own)
 */
export async function runMatrix(
  flags: Record<string, string | boolean>,
  projectRoot?: string,
  loaded?: { config: ValidatedConfig; canonical: CanonicalFiles },
): Promise<MatrixCommandResult> {
  const root = projectRoot ?? process.cwd();
  const scope = flags.global === true ? 'global' : 'project';
  const targetFilter = parseTargetsFlag(flags.targets);
  const { config, canonical } = loaded ?? (await loadProjectContext(root, { scope }));

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
