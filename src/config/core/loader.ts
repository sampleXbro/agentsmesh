/**
 * Find and load agentsmesh config file.
 */

import { parse as parseYaml } from 'yaml';
import { join, dirname, resolve } from 'node:path';
import { readFileSafe, exists } from '../../utils/filesystem/fs.js';
import { logger } from '../../utils/output/logger.js';
import { ConfigNotFoundError, ConfigValidationError } from '../../core/errors.js';
import { configSchema, type ValidatedConfig } from './schema.js';
import { formatConfigIssues } from './format-issues.js';

const CONFIG_FILENAME = 'agentsmesh.yaml';
const LOCAL_CONFIG_FILENAME = 'agentsmesh.local.yaml';

/**
 * Search upward from startDir for agentsmesh.yaml.
 * @param startDir - Directory to start searching from
 * @returns Absolute path to config file, or null if not found
 */
export async function findConfigPath(startDir: string): Promise<string | null> {
  let dir = resolve(startDir);

  while (true) {
    const configPath = join(dir, CONFIG_FILENAME);
    if (await exists(configPath)) {
      return configPath;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

/**
 * Load and validate config from a YAML file.
 * @param configPath - Absolute path to agentsmesh.yaml
 * @returns Validated config
 * @throws Error if file not found or validation fails
 */
export async function loadConfig(configPath: string): Promise<ValidatedConfig> {
  const content = await readFileSafe(configPath);
  if (content === null) {
    throw new ConfigNotFoundError(configPath);
  }

  const raw = parseYaml(content) as unknown;
  const result = configSchema.safeParse(raw);
  if (!result.success) {
    const issues = formatConfigIssues(result.error.issues);
    throw new ConfigValidationError(configPath, issues, { cause: result.error });
  }
  return result.data;
}

// Defense-in-depth against prototype-pollution payloads in
// `agentsmesh.local.yaml`. The `yaml` v2 parser already strips `__proto__`,
// and `constructor` does not recurse because `{}.constructor` is a function
// (not a plain object). Filtering these keys here pins the invariant so
// future refactors — different parser, different merge primitive — cannot
// silently reopen the hole.
const PROTOTYPE_POLLUTION_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function deepMergeObjects(
  base: Record<string, unknown>,
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...base };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === null || v === undefined) continue;
    if (PROTOTYPE_POLLUTION_KEYS.has(k)) continue;
    const baseVal = result[k];
    if (
      typeof v === 'object' &&
      !Array.isArray(v) &&
      v !== null &&
      typeof baseVal === 'object' &&
      baseVal !== null &&
      !Array.isArray(baseVal)
    ) {
      result[k] = deepMergeObjects(
        baseVal as Record<string, unknown>,
        v as Record<string, unknown>,
      );
    } else {
      result[k] = v;
    }
  }
  return result;
}

/** Per PRD 3.2: targets/features replace; overrides deep merge; extends append. */
function mergeLocalConfig(
  project: ValidatedConfig,
  local: Record<string, unknown>,
): ValidatedConfig {
  const merged = { ...project } as Record<string, unknown>;

  if (Array.isArray(local.targets) && local.targets.length > 0) {
    merged.targets = local.targets;
  }
  if (Array.isArray(local.features) && local.features.length > 0) {
    merged.features = local.features;
  }
  if (
    typeof local.overrides === 'object' &&
    local.overrides !== null &&
    !Array.isArray(local.overrides)
  ) {
    merged.overrides = deepMergeObjects(
      (merged.overrides ?? {}) as Record<string, unknown>,
      local.overrides as Record<string, unknown>,
    );
  }
  if (
    typeof local.conversions === 'object' &&
    local.conversions !== null &&
    !Array.isArray(local.conversions)
  ) {
    merged.conversions = deepMergeObjects(
      (merged.conversions ?? {}) as Record<string, unknown>,
      local.conversions as Record<string, unknown>,
    );
  }
  if (Array.isArray(local.extends) && local.extends.length > 0) {
    merged.extends = [...(project.extends ?? []), ...local.extends];
  }
  if (Array.isArray(local.plugins)) {
    merged.plugins = mergeById(project.plugins, local.plugins);
  }
  if (Array.isArray(local.pluginTargets)) {
    merged.pluginTargets = [...new Set([...project.pluginTargets, ...local.pluginTargets])];
  }
  if (
    typeof local.collaboration === 'object' &&
    local.collaboration !== null &&
    !Array.isArray(local.collaboration)
  ) {
    merged.collaboration = local.collaboration;
  }
  warnUnhandledLocalKeys(local);

  return merged as ValidatedConfig;
}

const LOCAL_KEYS = new Set([
  'version',
  'targets',
  'features',
  'overrides',
  'conversions',
  'extends',
  'plugins',
  'pluginTargets',
  'collaboration',
]);

function warnUnhandledLocalKeys(local: Record<string, unknown>): void {
  const unknown = Object.keys(local).filter((key) => !LOCAL_KEYS.has(key));
  if (unknown.length === 0) return;
  logger.warn(
    `agentsmesh.local.yaml: ignoring unknown key(s) ${unknown.join(', ')}; supported keys are ${[...LOCAL_KEYS].join(', ')}.`,
  );
}

/** Append local entries; a local entry with an existing id replaces the project one. */
function mergeById(project: readonly unknown[], local: readonly unknown[]): unknown[] {
  const byId = new Map<string, unknown>();
  const anonymous: unknown[] = [];
  for (const entry of [...project, ...local]) {
    const id =
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as { id?: unknown }).id === 'string'
        ? (entry as { id: string }).id
        : undefined;
    if (id === undefined) anonymous.push(entry);
    else byId.set(id, entry);
  }
  return [...byId.values(), ...anonymous];
}

export async function loadConfigFromExactDir(
  configDir: string,
): Promise<{ config: ValidatedConfig; configDir: string }> {
  const configPath = join(configDir, CONFIG_FILENAME);
  let config = await loadConfig(configPath);

  const localPath = join(configDir, LOCAL_CONFIG_FILENAME);
  const localContent = await readFileSafe(localPath);
  if (localContent !== null) {
    const localRaw = parseYaml(localContent) as unknown;
    if (typeof localRaw === 'object' && localRaw !== null && !Array.isArray(localRaw)) {
      const merged = mergeLocalConfig(config, localRaw as Record<string, unknown>);
      const parsed = configSchema.safeParse(merged);
      if (parsed.success) {
        config = parsed.data;
      } else {
        const issues = formatConfigIssues(parsed.error.issues).join('; ');
        logger.warn(
          `Ignoring invalid agentsmesh.local.yaml at ${localPath}: ${issues}. Using project config instead.`,
        );
      }
    }
  }

  return { config, configDir };
}

/**
 * Find config from dir, load it, merge agentsmesh.local.yaml if present.
 * Merge strategy (PRD 3.2): targets/features replace; overrides deep merge; extends append.
 * @param startDir - Directory to start searching from
 * @returns Config and directory containing agentsmesh.yaml
 * @throws Error if no config found
 */
export async function loadConfigFromDir(
  startDir: string,
): Promise<{ config: ValidatedConfig; configDir: string }> {
  const configPath = await findConfigPath(startDir);
  if (configPath === null) {
    throw new ConfigNotFoundError(join(startDir, CONFIG_FILENAME));
  }
  return loadConfigFromExactDir(dirname(configPath));
}
