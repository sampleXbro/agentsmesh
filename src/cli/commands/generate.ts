/**
 * agentsmesh generate — produce target files from canonical sources.
 */

import { parseTargetsFlag } from '../flags.js';
import { loadScopedConfig } from '../../config/core/scope.js';
import { loadCanonicalWithExtends } from '../../canonical/extends/extends.js';
import { buildChecksums, detectLockedFeatureViolations, readLock } from '../../config/core/lock.js';
import { generate as runEngine } from '../../core/generate/engine.js';
import { bootstrapPlugins } from '../../plugins/bootstrap-plugins.js';
import { logger } from '../../utils/output/logger.js';
import {
  handleEmptyResults,
  buildCheckResult,
  handleGenerateOrDryRun,
} from './generate-handlers.js';
import type { GenerateData } from '../command-result.js';
import { runLessonsMaintenance } from './generate-lessons.js';

export interface GenerateCommandResult {
  exitCode: number;
  data: GenerateData;
}

export interface RunGenerateOptions {
  printMatrix?: boolean;
}

/**
 * Run the generate command.
 * @param flags - CLI flags (targets, dry-run, verbose)
 * @param projectRoot - Project root (default process.cwd())
 */
export async function runGenerate(
  flags: Record<string, string | boolean>,
  projectRoot?: string,
  options: RunGenerateOptions = {},
): Promise<GenerateCommandResult> {
  if (flags.features !== undefined) {
    throw new Error('--features is no longer supported. Configure features in agentsmesh.yaml.');
  }

  const root = projectRoot ?? process.cwd();
  const checkOnly = flags.check === true;
  const dryRun = flags['dry-run'] === true;
  const force = flags.force === true;
  const scope = flags.global === true ? 'global' : 'project';
  const refreshRemoteCache = flags['refresh-cache'] === true || flags['no-cache'] === true;
  const targetFilter = parseTargetsFlag(flags.targets);

  const mode: GenerateData['mode'] = checkOnly ? 'check' : dryRun ? 'dry-run' : 'generate';

  const { config, context } = await loadScopedConfig(root, scope);
  await bootstrapPlugins(config, root);
  const lockFeatures = config.collaboration?.lock_features ?? [];
  if (config.collaboration?.strategy === 'lock' && !force && lockFeatures.length > 0) {
    const existingLock = await readLock(context.canonicalDir);
    if (existingLock !== null) {
      const currentChecksums = await buildChecksums(context.canonicalDir);
      const violations = detectLockedFeatureViolations(
        existingLock.checksums,
        currentChecksums,
        lockFeatures,
      );
      if (violations.length > 0) {
        logger.error('Locked feature violation (strategy: lock). Modified files:');
        for (const violation of violations) {
          logger.error(`  ${violation}`);
        }
        logger.error("Run 'agentsmesh generate --force' to accept these changes.");
        throw new Error('Locked feature violation. Use --force to override.');
      }
    }
  }

  const { canonical, resolvedExtends } = await loadCanonicalWithExtends(
    config,
    context.configDir,
    {
      refreshRemoteCache,
    },
    context.canonicalDir,
  );
  const allTargets = [...config.targets, ...(config.pluginTargets ?? [])];
  if (targetFilter) {
    const unknown = targetFilter.filter((t) => !allTargets.includes(t));
    if (unknown.length > 0) {
      throw new Error(
        `Unknown target(s) in --targets: ${unknown.join(', ')}. ` +
          `Available: ${allTargets.join(', ')}`,
      );
    }
  }
  const activeTargets = targetFilter
    ? allTargets.filter((t) => targetFilter.includes(t))
    : allTargets;

  const lessonsExit = scope === 'project' ? runLessonsMaintenance(context.rootBase, mode) : 0;

  const results = await runEngine({
    config,
    canonical,
    projectRoot: context.rootBase,
    scope,
    targetFilter,
  });

  if (results.length === 0) {
    return withLessonsExit(
      lessonsExit,
      await handleEmptyResults({
        mode,
        scope,
        dryRun,
        context,
        resolvedExtends,
        flags,
        root,
        options,
        activeTargets,
      }),
    );
  }

  if (checkOnly) {
    return withLessonsExit(lessonsExit, buildCheckResult(results, scope));
  }

  return withLessonsExit(
    lessonsExit,
    await handleGenerateOrDryRun({
      results,
      dryRun,
      scope,
      mode,
      context,
      activeTargets,
      configuredTargets: allTargets,
      resolvedExtends,
      flags,
      root,
      options,
    }),
  );
}

function withLessonsExit(
  lessonsExit: number,
  result: GenerateCommandResult,
): GenerateCommandResult {
  if (lessonsExit === 0) return result;
  return { ...result, exitCode: Math.max(result.exitCode, lessonsExit) };
}
