/**
 * Generate orchestrator: produces target-specific files from canonical sources.
 */

import type { CanonicalFiles, GenerateResult } from '../types.js';
import type { ValidatedConfig } from '../../config/core/schema.js';
import {
  getBuiltinTargetDefinition,
  getTargetLayout,
  resolveTargetFeatureGenerator,
} from '../../targets/catalog/builtin-targets.js';
import { getDescriptor } from '../../targets/catalog/registry.js';
import { getAdditionalRootDecorationPaths } from '../../targets/catalog/layout-outputs.js';
import { rewriteGeneratedReferences } from '../reference/rewriter.js';
import { validateGeneratedMarkdownLinks } from '../reference/validate-generated-markdown-links.js';
import { buildPackOriginatedKeys } from '../reference/pack-originated-keys.js';
import { resolveOutputCollisions, refreshResultStatus } from './collision.js';
import { generateFeature } from './feature-loop.js';
import { emitScopeExtras } from './scope-extras.js';
import { decoratePrimaryRootInstructions } from './root-instruction-decorator.js';
import {
  generatePermissionsFeature,
  generateHooksFeature,
  generateScopedSettingsFeature,
} from './optional-features.js';
import type { TargetLayoutScope } from '../../targets/catalog/target-descriptor.js';

export interface GenerateContext {
  config: ValidatedConfig;
  canonical: CanonicalFiles;
  projectRoot: string;
  scope?: TargetLayoutScope;
  targetFilter?: string[];
}

export { resolveOutputCollisions };

/** Features the plain per-target generator loop emits, in emission order. */
type LoopFeature = 'rules' | 'commands' | 'agents' | 'skills' | 'mcp' | 'ignore';

/**
 * Generate target files from canonical sources.
 * @param ctx - Config, canonical files, project root, optional target filter
 * @returns GenerateResult[] with status per file
 */
export async function generate(ctx: GenerateContext): Promise<GenerateResult[]> {
  const { config, canonical, projectRoot, scope = 'project', targetFilter } = ctx;
  const allTargets = [...config.targets, ...(config.pluginTargets ?? [])];
  const targets = targetFilter ? allTargets.filter((t) => targetFilter.includes(t)) : allTargets;

  function resolveGen(
    target: string,
    feature: Parameters<typeof resolveTargetFeatureGenerator>[1],
  ): ReturnType<typeof resolveTargetFeatureGenerator> {
    return resolveTargetFeatureGenerator(target, feature, config, scope);
  }
  const results: GenerateResult[] = [];

  const runFeature = (feature: LoopFeature): Promise<void> =>
    generateFeature(
      results,
      targets,
      canonical,
      projectRoot,
      config.features.includes(feature),
      scope,
      feature,
      (target) => resolveGen(target, feature),
    );

  for (const feature of ['rules', 'commands', 'agents', 'skills', 'mcp'] as const) {
    await runFeature(feature);
  }

  // Permissions: same pattern but merges with existing settings.json
  if (config.features.includes('permissions')) {
    await generatePermissionsFeature(results, targets, canonical, projectRoot, scope);
  }

  // Hooks: merges with any pending permissions result for same path
  if (config.features.includes('hooks')) {
    await generateHooksFeature(results, targets, canonical, projectRoot, scope, config);
  }

  await runFeature('ignore');

  // Per-target scope extras (e.g. Claude Code output-styles in global mode)
  const enabledFeatures: ReadonlySet<string> = new Set(config.features);
  for (const target of targets) {
    const descriptor = getBuiltinTargetDefinition(target) ?? getDescriptor(target);
    const scopeExtras = descriptor?.globalSupport?.scopeExtras;
    if (scopeExtras) {
      const extras = await scopeExtras(canonical, projectRoot, scope, enabledFeatures);
      await emitScopeExtras(results, target, extras, projectRoot);
    }
  }

  // Scoped settings: target-specific sidecars (e.g. Gemini settings.json, plugin settings)
  // hasRules is included so targets like opencode that write the instructions glob into their
  // config file (opencode.json) are reached even when rules is the only enabled feature.
  const wantsScopedSettings = (
    ['rules', 'mcp', 'ignore', 'hooks', 'agents', 'permissions'] as const
  ).some((feature) => config.features.includes(feature));
  if (wantsScopedSettings) {
    await generateScopedSettingsFeature(
      results,
      targets,
      canonical,
      projectRoot,
      scope,
      enabledFeatures,
    );
  }

  // Decoration must run before reference rewriting so that renderPrimaryRootInstruction output
  // (which uses canonical body verbatim) gets its canonical paths rewritten to target paths.
  const decoratedResults = decoratePrimaryRootInstructions(results, canonical, scope);
  const sharedPaths = computeSharedRootInstructionPaths(decoratedResults, scope);
  const rewrittenResults = rewriteGeneratedReferences(
    decoratedResults,
    canonical,
    config,
    projectRoot,
    scope,
    targets,
    sharedPaths,
  );

  validateGeneratedMarkdownLinks(rewrittenResults, projectRoot, {
    packOriginatedKeys: buildPackOriginatedKeys(canonical),
  });

  return resolveOutputCollisions(rewrittenResults.map(refreshResultStatus));
}

// Root-instruction paths (primary + compat) claimed by 2+ targets keep canonical references so
// every copy converges to byte-identical content for trivial collision merge. Only applies to
// root instructions — content files (skills, agents, commands) keep target-specific rewriting.
export function computeSharedRootInstructionPaths(
  results: GenerateResult[],
  scope: TargetLayoutScope,
): Set<string> {
  const rootPathsByTarget = new Map<string, Set<string>>();
  function rootPathsFor(target: string): Set<string> {
    const cached = rootPathsByTarget.get(target);
    if (cached) return cached;
    const layout = getTargetLayout(target, scope);
    const paths = new Set<string>();
    if (layout?.rootInstructionPath) {
      paths.add(layout.rootInstructionPath);
      for (const extra of getAdditionalRootDecorationPaths(layout)) paths.add(extra);
    }
    rootPathsByTarget.set(target, paths);
    return paths;
  }

  const targetsByPath = new Map<string, Set<string>>();
  for (const r of results) {
    if (!rootPathsFor(r.target).has(r.path)) continue;
    const set = targetsByPath.get(r.path) ?? new Set<string>();
    set.add(r.target);
    targetsByPath.set(r.path, set);
  }
  const shared = new Set<string>();
  for (const [path, targetSet] of targetsByPath) {
    if (targetSet.size > 1) shared.add(path);
  }
  return shared;
}
