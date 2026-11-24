import { z } from 'zod';
import { TARGET_IDS } from '../../targets/catalog/target-ids.js';

const VALID_FEATURES = [
  'rules',
  'commands',
  'agents',
  'skills',
  'mcp',
  'hooks',
  'ignore',
  'permissions',
  'files',
] as const;

/** Valid `extends[].target` / `agentsmesh install --target` identifiers */
export const targetSchema = z.enum(TARGET_IDS);
export const featureSchema = z.enum(VALID_FEATURES);
export const installAsSchema = z.enum(['rules', 'commands', 'agents', 'skills']);

/** Cherry-pick resource names within array features (extends.install + merge). */
export const extendPickSchema = z
  .object({
    skills: z.array(z.string()).optional(),
    commands: z.array(z.string()).optional(),
    rules: z.array(z.string()).optional(),
    agents: z.array(z.string()).optional(),
    /** Picomatch globs (same dialect as rule `globs`); `dir/` + `**` selects a folder. */
    files: z.array(z.string()).optional(),
  })
  .strict();

export type ExtendPick = z.infer<typeof extendPickSchema>;

const extendSourceSchema = z.object({
  name: z.string(),
  source: z.string(),
  version: z.string().optional(),
  target: targetSchema.optional(),
  as: installAsSchema.optional(),
  features: z.array(featureSchema),
  /** Repo-relative POSIX path for discovery (skill packs, nested .agentsmesh). */
  path: z.string().optional(),
  pick: extendPickSchema.optional(),
  /**
   * Per-entry consent for "elevated" artifacts (`hooks`, `permissions`, `mcp`)
   * from a remote source. These control local code execution at generate time,
   * so for non-local extends they are stripped by default and only merged for
   * the artifacts listed here. Local extends are trusted and ignore this field.
   */
  accept: z.array(z.enum(['hooks', 'permissions', 'mcp'])).optional(),
});

const collaborationSchema = z.object({
  strategy: z.enum(['merge', 'lock', 'last-wins']).default('merge'),
  lock_features: z.array(z.string()).default([]),
});

const conversionValueSchema = z.union([
  z.boolean(),
  z.object({ project: z.boolean().optional(), global: z.boolean().optional() }).strict(),
]);

const conversionsSchema = z
  .object({
    commands_to_skills: z
      .object({
        'codex-cli': conversionValueSchema.optional(),
      })
      .passthrough()
      .optional(),
    agents_to_skills: z
      .object({
        'gemini-cli': conversionValueSchema.optional(),
        cline: conversionValueSchema.optional(),
        'codex-cli': conversionValueSchema.optional(),
        windsurf: conversionValueSchema.optional(),
      })
      .passthrough()
      .optional(),
  })
  .strict()
  .optional();

// Plugins load via dynamic `import()` and execute as trusted Node.js modules
// with full process privileges (filesystem, network, child processes). The CLI
// does not sandbox plugin code. Only register plugins from sources you trust.
export const pluginEntrySchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    source: z.string(),
    version: z.string().optional(),
    /**
     * When true, a failure to import or validate this plugin throws and
     * aborts the run. Default `false` keeps the lenient behavior of logging
     * a warning and continuing. Use strict mode in CI when missing
     * descriptors should fail the build instead of silently shrinking the
     * generation matrix.
     */
    strict: z.boolean().optional(),
  })
  .strict();

export type PluginEntry = z.infer<typeof pluginEntrySchema>;

/**
 * Zod schema for `agentsmesh.yaml` config validation.
 *
 * Every field except `version` uses `.default(...)` so the runtime parser
 * substitutes a documented value when the user omits the key. The published
 * JSON Schema removes these from the top-level `required` array via
 * `stripRequiredFromDefaults()` in `src/schemas/schema-generator.ts`, so
 * editors don't complain about valid minimal configs (a `version: 1`-only
 * file is allowed). Runtime parser typing stays `T` (not `T | undefined`) —
 * the post-process fix lives at the publishing layer only.
 */
export const configSchema = z.object({
  version: z.literal(1),
  targets: z.array(targetSchema).default([...TARGET_IDS]),
  features: z.array(featureSchema).default([...VALID_FEATURES]),
  extends: z.array(extendSourceSchema).default([]),
  overrides: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
  collaboration: collaborationSchema.default({ strategy: 'merge', lock_features: [] }),
  conversions: conversionsSchema,
  plugins: z.array(pluginEntrySchema).default([]),
  pluginTargets: z.array(z.string().regex(/^[a-z][a-z0-9-]*$/)).default([]),
});

export type ValidatedConfig = z.infer<typeof configSchema>;
