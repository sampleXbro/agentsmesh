import type { CanonicalFiles, GenerateResult } from '../types.js';
import type { ValidatedConfig } from '../../config/core/schema.js';
import {
  getBuiltinTargetDefinition,
  resolveTargetFeatureGenerator,
} from '../../targets/catalog/builtin-targets.js';
import { getDescriptor } from '../../targets/catalog/registry.js';
import { emitGeneratedOutput, featureContext } from './feature-loop.js';
import { outputMergeOptions } from './merge-policy.js';
import type { TargetLayoutScope } from '../../targets/catalog/target-descriptor.js';
import { withTargetRecallHooks } from '../../targets/catalog/recall-hook-targets.js';

export async function generatePermissionsFeature(
  results: GenerateResult[],
  targets: string[],
  canonical: CanonicalFiles,
  projectRoot: string,
  scope: TargetLayoutScope,
): Promise<void> {
  for (const target of targets) {
    const gen =
      resolveTargetFeatureGenerator(target, 'permissions', undefined, scope) ??
      getDescriptor(target)?.generators.generatePermissions;
    if (!gen) continue;
    const ctx = featureContext(target, 'permissions', scope);
    const options = outputMergeOptions(target);
    for (const out of gen(canonical, ctx)) {
      await emitGeneratedOutput(results, target, out, projectRoot, scope, options);
    }
  }
}

export async function generateHooksFeature(
  results: GenerateResult[],
  targets: string[],
  canonical: CanonicalFiles,
  projectRoot: string,
  scope: TargetLayoutScope,
  config: ValidatedConfig,
): Promise<void> {
  for (const target of targets) {
    const gen =
      resolveTargetFeatureGenerator(target, 'hooks', config, scope) ??
      getDescriptor(target)?.generators.generateHooks;
    if (!gen) continue;
    const ctx = featureContext(target, 'hooks', scope);
    // Builtins already project inside their generators; this keeps plugin
    // descriptors honest. Applying it twice is harmless.
    const projected = withTargetRecallHooks(canonical, target);
    let outputs = [...gen(projected, ctx)];
    const descriptor = getBuiltinTargetDefinition(target) ?? getDescriptor(target);
    const post = descriptor?.postProcessHookOutputs;
    if (post) {
      outputs = [...(await post(projectRoot, projected, outputs))];
    }
    const options = outputMergeOptions(target);
    for (const out of outputs) {
      await emitGeneratedOutput(results, target, out, projectRoot, scope, options);
    }
  }
}

export async function generateScopedSettingsFeature(
  results: GenerateResult[],
  targets: string[],
  canonical: CanonicalFiles,
  projectRoot: string,
  scope: TargetLayoutScope,
  enabledFeatures: ReadonlySet<string>,
): Promise<void> {
  for (const target of targets) {
    const descriptor = getBuiltinTargetDefinition(target) ?? getDescriptor(target);
    const emit = descriptor?.emitScopedSettings;
    if (!emit) continue;
    const outputs = emit(withTargetRecallHooks(canonical, target), scope, enabledFeatures);
    if (outputs.length === 0) continue;
    const options = outputMergeOptions(target);
    for (const out of outputs) {
      await emitGeneratedOutput(results, target, out, projectRoot, scope, options);
    }
  }
}
