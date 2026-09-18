/**
 * Lint engine: validates canonical files against target constraints.
 */

import { relative } from 'node:path';
import type { CanonicalFiles, LintDiagnostic } from '../types.js';
import type { ValidatedConfig } from '../../config/core/schema.js';
import type { TargetLayoutScope } from '../../targets/catalog/target-descriptor.js';
import { readDirRecursive } from '../../utils/filesystem/fs.js';
import { getDescriptor } from '../../targets/catalog/registry.js';
import { lintSilentFeatureDrops } from './shared/silent-drop-guard.js';
import { lintHookScriptReferences } from './shared/hook-script-references.js';
import { lintRuleScopeInversion } from './shared/rule-scope-inversion.js';
import { lintLessonsSubsystem } from './shared/lessons.js';

const EXCLUDE_DIRS = ['node_modules', '.git', 'dist', 'coverage', '.agentsmesh'];

/**
 * Get project file paths relative to projectRoot, excluding common dirs.
 */
/** Separator-agnostic: `relative()` yields backslashes on Windows. */
export function isExcludedProjectPath(rel: string): boolean {
  const posix = rel.replaceAll('\\', '/');
  return EXCLUDE_DIRS.some((d) => posix.includes(`/${d}/`) || posix.startsWith(`${d}/`));
}

async function getProjectFiles(projectRoot: string): Promise<string[]> {
  const all = await readDirRecursive(projectRoot);
  return all
    .filter((p) => !isExcludedProjectPath(relative(projectRoot, p)))
    .map((p) => relative(projectRoot, p));
}

/**
 * Run lint across all enabled targets.
 * @param config - Validated config
 * @param canonical - Loaded canonical files
 * @param projectRoot - Project root for glob matching
 * @param targetFilter - Optional target filter (e.g. from --targets)
 * @returns All diagnostics, and whether any are errors
 */
export async function runLint(
  config: ValidatedConfig,
  canonical: CanonicalFiles,
  projectRoot: string,
  targetFilter?: string[],
  options: { scope?: TargetLayoutScope } = {},
): Promise<{ diagnostics: LintDiagnostic[]; hasErrors: boolean }> {
  const scope = options.scope ?? 'project';
  const allTargets = [...config.targets, ...(config.pluginTargets ?? [])];
  const targets = targetFilter ? allTargets.filter((t) => targetFilter.includes(t)) : allTargets;
  const hasRules = config.features.includes('rules');
  const hasCommands = config.features.includes('commands');
  const hasMcp = config.features.includes('mcp');
  const hasPermissions = config.features.includes('permissions');
  const hasHooks = config.features.includes('hooks');
  const hasIgnore = config.features.includes('ignore');

  const diagnostics: LintDiagnostic[] = [...lintLessonsSubsystem(projectRoot, scope)];
  const projectFiles = scope === 'global' ? [] : await getProjectFiles(projectRoot);

  for (const target of targets) {
    const descriptor = getDescriptor(target);

    if (descriptor?.capabilities) {
      diagnostics.push(
        ...lintSilentFeatureDrops({
          target,
          capabilities: descriptor.capabilities,
          canonical,
          enabledFeatures: config.features,
        }),
      );
    }

    if (hasHooks) {
      diagnostics.push(
        ...lintHookScriptReferences({
          target,
          canonical,
          hasScriptProjection: descriptor?.postProcessHookOutputs !== undefined,
        }),
      );
    }

    if (hasRules) {
      diagnostics.push(
        ...lintRuleScopeInversion({
          target,
          canonical,
          preservesManualActivation: descriptor?.preservesManualActivation === true,
        }),
      );
    }

    if (hasRules && descriptor?.lintRules) {
      diagnostics.push(...descriptor.lintRules(canonical, projectRoot, projectFiles, { scope }));
    }
    if (descriptor?.generators.lint) {
      diagnostics.push(...descriptor.generators.lint(canonical));
    }
    const lintOpts = { scope };
    if (hasCommands && descriptor?.lint?.commands) {
      diagnostics.push(...descriptor.lint.commands(canonical, lintOpts));
    }
    if (hasMcp && descriptor?.lint?.mcp) {
      diagnostics.push(...descriptor.lint.mcp(canonical, lintOpts));
    }
    if (hasPermissions && descriptor?.lint?.permissions) {
      diagnostics.push(...descriptor.lint.permissions(canonical, lintOpts));
    }
    if (hasHooks && descriptor?.lint?.hooks) {
      diagnostics.push(...descriptor.lint.hooks(canonical, lintOpts));
    }
    if (hasIgnore && descriptor?.lint?.ignore) {
      diagnostics.push(...descriptor.lint.ignore(canonical, lintOpts));
    }
  }

  const hasErrors = diagnostics.some((d) => d.level === 'error');
  return { diagnostics, hasErrors };
}
