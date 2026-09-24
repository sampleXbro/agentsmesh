/**
 * Public API — generation, import, lint, diff, check (see package.json "exports"."./engine").
 * Stability: follow semver for these symbols; internal modules are not supported.
 */

export { generate, resolveOutputCollisions } from '../core/generate/engine.js';
export type { GenerateContext } from '../core/generate/engine.js';
export type { GenerateResult, ImportResult, LintDiagnostic } from '../core/types.js';
export {
  AgentsMeshError,
  ConfigNotFoundError,
  ConfigValidationError,
  TargetNotFoundError,
  ImportError,
  GenerationError,
  RemoteFetchError,
  LockAcquisitionError,
  FileSystemError,
} from '../core/errors.js';
export type { AgentsMeshErrorCode } from '../core/errors.js';

import type { ImportResult } from '../core/types.js';
import { TargetNotFoundError } from '../core/errors.js';
import { loadConfigFromDir, loadConfigFromExactDir } from '../config/core/loader.js';
import { loadScopedConfig } from '../config/core/scope.js';
import { loadCanonicalWithExtends } from '../canonical/extends/extends.js';
import { bootstrapPlugins } from '../plugins/bootstrap-plugins.js';
import { runLint as runLintInternal } from '../core/lint/linter.js';
import { generate as runGenerate } from '../core/generate/engine.js';
import { computeDiff as computeDiffInternal, formatDiffSummary } from '../core/differ.js';
import {
  checkLockSync as checkLockSyncInternal,
  type CheckLockSyncOptions,
  type LockSyncReport,
} from '../core/check/lock-sync.js';
import type { CanonicalFiles, GenerateResult, LintDiagnostic } from '../core/types.js';
import type { ValidatedConfig } from '../config/core/schema.js';
import type { TargetLayoutScope } from '../targets/catalog/target-descriptor.js';
import type { ComputeDiffResult } from '../core/differ.js';
import { getDescriptor, getAllDescriptors } from '../targets/catalog/registry.js';
import { TARGET_IDS } from '../targets/catalog/target-ids.js';
import { runTargetImport } from '../targets/import/run-target-import.js';

export type { ValidatedConfig } from '../config/core/schema.js';
export type { TargetLayoutScope } from '../targets/catalog/target-descriptor.js';
export type { CheckLockSyncOptions, LockSyncReport } from '../core/check/lock-sync.js';
export type { ComputeDiffResult, DiffEntry, DiffSummary } from '../core/differ.js';

export { formatDiffSummary };

export async function importFrom(
  target: string,
  opts: { root: string; scope?: 'project' | 'global' },
): Promise<ImportResult[]> {
  const descriptor = getDescriptor(target);
  if (!descriptor) {
    throw new TargetNotFoundError(target, {
      supported: [...TARGET_IDS, ...getAllDescriptors().map((d) => d.id)],
    });
  }
  return runTargetImport(descriptor, opts.root, opts.scope ?? 'project');
}

/**
 * Load and validate `agentsmesh.yaml` from a project root, merging
 * `agentsmesh.local.yaml` if present. Searches upward from `projectRoot` for
 * the config file (matches CLI behaviour).
 *
 * Throws `ConfigNotFoundError` when no config is found, or
 * `ConfigValidationError` when YAML parses but fails schema validation.
 */
export async function loadConfig(
  projectRoot: string,
): Promise<{ config: ValidatedConfig; configDir: string }> {
  return loadConfigFromDir(projectRoot);
}

/**
 * Like {@link loadConfig} but does not search upward — reads
 * `<configDir>/agentsmesh.yaml` directly. Used by global scope where the
 * canonical directory is `~/.agentsmesh/`.
 */
export async function loadConfigFromDirectory(
  configDir: string,
): Promise<{ config: ValidatedConfig; configDir: string }> {
  return loadConfigFromExactDir(configDir);
}

export interface LoadProjectContextOptions {
  /** Defaults to `'project'`. Use `'global'` to load `~/.agentsmesh/`. */
  readonly scope?: TargetLayoutScope;
  /** Refresh remote extend cache before loading canonical content. */
  readonly refreshRemoteCache?: boolean;
}

export interface ProjectContext {
  readonly config: ValidatedConfig;
  readonly canonical: CanonicalFiles;
  /** Root base used for generated paths: project config dir or user home for global scope. */
  readonly projectRoot: string;
  readonly scope: TargetLayoutScope;
  readonly configDir: string;
  readonly canonicalDir: string;
}

/**
 * Load the same execution context the CLI uses: scoped config, plugin
 * descriptors, extends, packs, and local canonical content. The returned object
 * is directly usable as a `GenerateContext` because it contains
 * `{ config, canonical, projectRoot, scope }`.
 */
export async function loadProjectContext(
  projectRoot: string,
  options: LoadProjectContextOptions = {},
): Promise<ProjectContext> {
  const scope = options.scope ?? 'project';
  const { config, context } = await loadScopedConfig(projectRoot, scope);
  await bootstrapPlugins(config, projectRoot);
  const { canonical } = await loadCanonicalWithExtends(
    config,
    context.configDir,
    { refreshRemoteCache: options.refreshRemoteCache === true },
    context.canonicalDir,
  );
  return {
    config,
    canonical,
    projectRoot: context.rootBase,
    scope,
    configDir: context.configDir,
    canonicalDir: context.canonicalDir,
  };
}

export interface LintOptions {
  readonly config: ValidatedConfig;
  readonly canonical: CanonicalFiles;
  /** Directory used for project-file glob matching (typically the project root). */
  readonly projectRoot: string;
  /** Optional whitelist of target IDs to lint. Defaults to all enabled. */
  readonly targetFilter?: readonly string[];
  /** Defaults to `'project'`. */
  readonly scope?: TargetLayoutScope;
}

export interface LintResult {
  readonly diagnostics: readonly LintDiagnostic[];
  readonly hasErrors: boolean;
}

/**
 * Run lint across all enabled targets and return diagnostics. Pure: no I/O,
 * no logging. Equivalent to `agentsmesh lint` minus formatting and exit code.
 */
export async function lint(opts: LintOptions): Promise<LintResult> {
  const filter = opts.targetFilter ? [...opts.targetFilter] : undefined;
  return runLintInternal(opts.config, opts.canonical, opts.projectRoot, filter, {
    scope: opts.scope,
  });
}

/**
 * Compute unified diffs from a generate-result set. Use this when you already
 * have results in hand (e.g. from {@link import('./engine.js').generate})
 * and want to display drift without re-running generation.
 */
export function computeDiff(results: readonly GenerateResult[]): ComputeDiffResult {
  return computeDiffInternal([...results]);
}

/**
 * Run generation and return the unified diff against on-disk content.
 * Equivalent to `agentsmesh diff` minus formatting. Calls {@link generate}
 * internally; returns both the raw results and the diff.
 */
export async function diff(
  ctx: import('../core/generate/engine.js').GenerateContext,
): Promise<ComputeDiffResult & { results: readonly GenerateResult[] }> {
  const results = await runGenerate(ctx);
  const computed = computeDiffInternal(results);
  return { ...computed, results };
}

/**
 * Compare the lock file at `canonicalDir/.lock` against the current canonical
 * state and resolved extends. Equivalent to `agentsmesh check` minus
 * formatting and exit code. Returns `hasLock: false` and `inSync: false` when
 * no lock is present.
 */
export async function check(opts: CheckLockSyncOptions): Promise<LockSyncReport> {
  return checkLockSyncInternal(opts);
}

// Re-export CanonicalFiles so consumers using the engine entrypoint alone can
// type the `canonical` field of GenerateContext / LintOptions without pulling
// in the canonical entrypoint.
export type { CanonicalFiles } from '../core/types.js';
