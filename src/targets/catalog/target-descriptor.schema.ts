/**
 * Runtime Zod schema for TargetDescriptor.
 * Validates plugin-provided descriptors before registration.
 * Strategy: validate structural fields tightly; treat callbacks as z.function()
 * (Zod's function validation is weak — TypeScript catches real errors at plugin build time).
 */

import { z } from 'zod';
import type { TargetDescriptor } from './target-descriptor.js';

const capabilityLevelSchema = z.union([
  z.enum(['native', 'embedded', 'partial', 'none']),
  z.object({
    level: z.enum(['native', 'embedded', 'partial', 'none']),
    flavor: z.string().optional(),
  }),
]);

const capabilitiesSchema = z.object({
  rules: capabilityLevelSchema,
  additionalRules: capabilityLevelSchema,
  commands: capabilityLevelSchema,
  agents: capabilityLevelSchema,
  skills: capabilityLevelSchema,
  mcp: capabilityLevelSchema,
  hooks: capabilityLevelSchema,
  ignore: capabilityLevelSchema,
  permissions: capabilityLevelSchema,
});

const generatorsSchema = z
  .object({
    name: z.string(),
    generateRules: z.function(),
    importFrom: z.function(),
    generateCommands: z.function().optional(),
    generateAgents: z.function().optional(),
    generateSkills: z.function().optional(),
    generateMcp: z.function().optional(),
    generatePermissions: z.function().optional(),
    generateHooks: z.function().optional(),
    generateIgnore: z.function().optional(),
    lint: z.function().optional(),
  })
  .passthrough();

const pathResolversSchema = z.object({
  rulePath: z.function(),
  commandPath: z.function(),
  agentPath: z.function(),
});

// `files` is the delete list and `coOwnedFiles` the never-delete list, so a path
// in both would make stale cleanup's answer depend on iteration order.
const managedOutputsSchema = z
  .object({
    dirs: z.array(z.string()),
    files: z.array(z.string()),
    coOwnedFiles: z.array(z.string()).optional(),
    supersededFiles: z.array(z.string()).optional(),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    for (const file of value.supersededFiles ?? []) {
      if (!value.files.includes(file) && !(value.coOwnedFiles ?? []).includes(file)) continue;
      ctx.addIssue({
        code: 'custom',
        path: ['supersededFiles'],
        message: `"${file}" is in managedOutputs.supersededFiles and another managedOutputs list.`,
      });
    }
    for (const file of value.coOwnedFiles ?? []) {
      if (!value.files.includes(file)) continue;
      ctx.addIssue({
        code: 'custom',
        path: ['coOwnedFiles'],
        message: `"${file}" is in both managedOutputs.files and managedOutputs.coOwnedFiles.`,
      });
    }
  });

const layoutSchema = z
  .object({
    paths: pathResolversSchema,
    managedOutputs: managedOutputsSchema.optional(),
  })
  .passthrough();

const globalSupportSchema = z
  .object({
    capabilities: capabilitiesSchema,
    detectionPaths: z.array(z.string()),
    layout: layoutSchema,
    scopeExtras: z.function().optional(),
  })
  .passthrough();

const legacyGlobalKeys = [
  'global',
  'globalCapabilities',
  'globalDetectionPaths',
  'generateScopeExtras',
] as const;

type CapabilitiesShape = z.infer<typeof capabilitiesSchema>;
type GeneratorsShape = z.infer<typeof generatorsSchema>;

interface DescriptorShape {
  readonly generators: GeneratorsShape;
  readonly emitScopedSettings?: unknown;
  readonly globalSupport?: { readonly scopeExtras?: unknown };
}

const generatorRequirements = [
  { feature: 'commands', generator: 'generateCommands' },
  { feature: 'agents', generator: 'generateAgents' },
  { feature: 'skills', generator: 'generateSkills' },
  { feature: 'mcp', generator: 'generateMcp' },
  { feature: 'hooks', generator: 'generateHooks' },
  { feature: 'ignore', generator: 'generateIgnore' },
  { feature: 'permissions', generator: 'generatePermissions' },
] as const;

const settingsBackedFeatures = ['mcp', 'hooks', 'ignore', 'permissions'] as const;

function capabilityLevel(capability: CapabilitiesShape[keyof CapabilitiesShape]): string {
  return typeof capability === 'string' ? capability : capability.level;
}

function canUseScopedSettings(feature: (typeof generatorRequirements)[number]['feature']): boolean {
  return (settingsBackedFeatures as readonly string[]).includes(feature);
}

function validateCapabilityImplementations(
  descriptor: DescriptorShape,
  capabilities: CapabilitiesShape,
  ctx: z.RefinementCtx,
  pathPrefix: readonly (string | number)[],
): void {
  // `scopeExtras` runs only at global scope, so it can satisfy a settings-backed
  // capability (mcp/hooks/ignore/permissions) when validating global caps —
  // e.g. Continue emits ~/.continue/permissions.yaml from its scopeExtras.
  const isGlobalScope = pathPrefix[0] === 'globalSupport';
  const hasScopeExtras =
    isGlobalScope && typeof descriptor.globalSupport?.scopeExtras === 'function';
  for (const requirement of generatorRequirements) {
    const level = capabilityLevel(capabilities[requirement.feature]);
    if (level === 'none') continue;
    const settingsBacked = canUseScopedSettings(requirement.feature);
    const hasGenerator = typeof descriptor.generators[requirement.generator] === 'function';
    const hasSettingsEmitter =
      settingsBacked && typeof descriptor.emitScopedSettings === 'function';
    const hasScopeExtrasEmitter = settingsBacked && hasScopeExtras;
    if (hasGenerator || hasSettingsEmitter || hasScopeExtrasEmitter) continue;
    const settingsHint = settingsBacked
      ? isGlobalScope
        ? ' or emitScopedSettings or globalSupport.scopeExtras'
        : ' or emitScopedSettings'
      : '';
    ctx.addIssue({
      code: 'custom',
      path: [...pathPrefix, requirement.feature],
      message:
        `Capability "${requirement.feature}" is "${level}" but ` +
        `generators.${requirement.generator}${settingsHint} is missing.`,
    });
  }
}

/**
 * Structural Zod schema for TargetDescriptor.
 * Uses passthrough() on the root so unknown plugin fields don't cause rejection.
 */
const conversionDefaultsSchema = z
  .object({
    commandsToSkills: z.boolean().optional(),
    agentsToSkills: z.boolean().optional(),
  })
  .strict();

const metadataSchema = z
  .object({
    displayName: z.string().min(1),
    category: z.enum(['cli', 'ide', 'agent-platform']),
    officialUrl: z.string().min(1),
    shortDescription: z.string().min(1),
  })
  .passthrough();

const nativePickStrategySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('basename'), suffix: z.string().min(1) }),
  z.object({ kind: z.literal('skillDir') }),
  z.object({ kind: z.literal('firstSegment') }),
]);

const nativeInstallSchema = z
  .object({
    pickPaths: z
      .array(
        z.object({
          prefix: z.string().min(1),
          feature: z.enum(['commands', 'rules', 'agents', 'skills']),
          strategy: nativePickStrategySchema,
        }),
      )
      .optional(),
    inferPick: z.function().optional(),
    dialectHints: z.array(z.object({ frontmatterKey: z.string().min(1) })).optional(),
  })
  .strict();

const targetDescriptorSchemaBase = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/, 'Target id must be lowercase with hyphens'),
    metadata: metadataSchema,
    generators: generatorsSchema,
    capabilities: capabilitiesSchema,
    emptyImportMessage: z.string(),
    lintRules: z.union([z.function(), z.null()]),
    project: layoutSchema,
    globalSupport: globalSupportSchema.optional(),
    buildImportPaths: z.function(),
    detectionPaths: z.array(z.string()),
    nativeInstall: nativeInstallSchema.optional(),
    excludeFromStarterInit: z.boolean().optional(),
    conversionDefaults: conversionDefaultsSchema.optional(),
    emitScopedSettings: z.function().optional(),
    mergeGeneratedOutputContent: z.function().optional(),
    postProcessHookOutputs: z.function().optional(),
    hookContextEvents: z.array(z.string()).optional(),
    preservesManualActivation: z.boolean().optional(),
  })
  .passthrough();

// The runtime schema validates structure: callbacks remain `z.function()` (Zod
// can't model TS parameter types) but the interface-required fields (`id`,
// `metadata`, `generators`, `capabilities`, `project`, `buildImportPaths`,
// `detectionPaths`, `emptyImportMessage`, `lintRules`) are now ALL present in
// `targetDescriptorSchemaBase`. The cast to `z.ZodSchema<TargetDescriptor>`
// bridges the function-type gap; it is honest about Zod's limitation, not a
// laundering of missing fields.
export const targetDescriptorSchema = targetDescriptorSchemaBase.superRefine((value, ctx) => {
  for (const key of legacyGlobalKeys) {
    if (key in value) {
      ctx.addIssue({
        code: 'custom',
        path: [key],
        message: `Use globalSupport instead of legacy field "${key}".`,
      });
    }
  }
  validateCapabilityImplementations(value, value.capabilities, ctx, ['capabilities']);
  if (value.globalSupport !== undefined) {
    validateCapabilityImplementations(value, value.globalSupport.capabilities, ctx, [
      'globalSupport',
      'capabilities',
    ]);
  }
}) as unknown as z.ZodSchema<TargetDescriptor>;

/**
 * Validate a plugin-provided descriptor.
 * @throws ZodError if the shape is invalid
 */
export function validateDescriptor(value: unknown): TargetDescriptor {
  return targetDescriptorSchema.parse(value);
}
