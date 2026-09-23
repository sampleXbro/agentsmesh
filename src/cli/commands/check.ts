/**
 * agentsmesh check — CI integration for team collaboration.
 * Verifies canonical files match the lock file.
 */

import { loadScopedConfig } from '../../config/core/scope.js';
import { checkLockSync } from '../../core/check/lock-sync.js';
import { lessonsGraphProblem } from '../../lessons/graph-problem.js';
import { bootstrapPlugins } from '../../plugins/bootstrap-plugins.js';
import type { CheckData } from '../command-result.js';

export interface CheckCommandResult {
  exitCode: number;
  data: CheckData;
  /** Set when a lessons graph exists but cannot be read; always fails the check. */
  error?: string;
}

/**
 * Run the check command.
 * @param flags - CLI flags. `--global` targets `~/.agentsmesh`; `--no-outputs`
 *   skips generated-output verification.
 * @param projectRoot - Project root (default process.cwd())
 * @returns Structured check result with exit code and data
 */
export async function runCheck(
  flags: Record<string, string | boolean>,
  projectRoot?: string,
): Promise<CheckCommandResult> {
  const root = projectRoot ?? process.cwd();
  const scope = flags.global === true ? 'global' : 'project';

  const { config, context } = await loadScopedConfig(root, scope);
  await bootstrapPlugins(config, root);

  // `--no-outputs` disables generated-output verification by withholding
  // `rootBase`, which is exactly the signal checkLockSync uses to skip it.
  const verifyOutputs = flags['no-outputs'] !== true;

  const report = await checkLockSync({
    config,
    configDir: context.configDir,
    canonicalDir: context.canonicalDir,
    rootBase: verifyOutputs ? context.rootBase : undefined,
    scope,
  });

  const result = lockResult(report);
  const problem = scope === 'project' ? lessonsGraphProblem(context.configDir) : null;
  if (problem === null) return result;
  return { ...result, exitCode: 1, error: `Lessons graph unreadable: ${problem.message}` };
}

function lockResult(report: Awaited<ReturnType<typeof checkLockSync>>): CheckCommandResult {
  if (!report.hasLock) {
    return {
      exitCode: 1,
      data: {
        hasLock: false,
        canonicalDrift: false,
        outputDrift: false,
        inSync: false,
        modified: [],
        added: [],
        removed: [],
        extendsModified: [],
        lockedViolations: [],
        outputsModified: [],
        outputsRemoved: [],
        outputsStale: [],
        outputsUntracked: [],
        outputsChecked: false,
      },
    };
  }

  return {
    exitCode: report.inSync ? 0 : 1,
    data: {
      hasLock: true,
      canonicalDrift: report.canonicalDrift,
      outputDrift: report.outputDrift,
      inSync: report.inSync,
      modified: [...report.modified],
      added: [...report.added],
      removed: [...report.removed],
      extendsModified: [...report.extendsModified],
      lockedViolations: [...report.lockedViolations],
      outputsModified: [...report.outputsModified],
      outputsRemoved: [...report.outputsRemoved],
      outputsStale: [...report.outputsStale],
      outputsUntracked: [...report.outputsUntracked],
      outputsChecked: report.outputsChecked,
    },
  };
}
