import type { ValidatedConfig } from '../../config/core/schema.js';
import type { TargetLayoutScope } from '../../targets/catalog/target-descriptor.js';

export interface LockSyncReport {
  /** True when canonical state and checked generated outputs are all in sync. */
  readonly inSync: boolean;
  /** True when a readable `.lock` file was found at the canonical directory. */
  readonly hasLock: boolean;
  /**
   * True when the `.lock` file has git conflict markers, so it cannot be read
   * (`hasLock` is false). `agentsmesh merge` rebuilds it.
   */
  readonly lockConflict: boolean;
  /** True when canonical files or extends differ from the lock. */
  readonly canonicalDrift: boolean;
  /** True when a generated output is modified, removed, or stale, or a target is stale. */
  readonly outputDrift: boolean;
  /** Canonical files whose checksum differs from the lock. */
  readonly modified: readonly string[];
  /** Canonical files present now but not in the lock. */
  readonly added: readonly string[];
  /** Canonical files in the lock but missing now. */
  readonly removed: readonly string[];
  /** Extend names whose pinned version/checksum differs from the lock. */
  readonly extendsModified: readonly string[];
  /**
   * Subset of `modified ∪ added ∪ removed` that violates
   * `collaboration.lock_features`. Empty when no `lock_features` are configured.
   */
  readonly lockedViolations: readonly string[];
  /** Generated outputs whose on-disk hash differs from the lock. */
  readonly outputsModified: readonly string[];
  /** Generated outputs recorded in the lock but missing from disk. */
  readonly outputsRemoved: readonly string[];
  /** Managed generated outputs present on disk but absent from the lock. */
  readonly outputsStale: readonly string[];
  /**
   * Enabled targets a `generate --targets` run left out after canonical
   * sources changed, so their outputs were not regenerated from them.
   */
  readonly staleTargets: readonly string[];
  /**
   * Files inside a managed directory the lock does not claim — the tool's own
   * output or something hand-authored. Informational: deliberately excluded
   * from `outputDrift` and `inSync`, because `generate` cannot remove them.
   */
  readonly outputsUntracked: readonly string[];
  /**
   * True when output drift was actually verified — requires `rootBase` and a
   * lock with an `outputs` map. False for old-format locks or when no
   * `rootBase` was supplied.
   */
  readonly outputsChecked: boolean;
}

export interface CheckLockSyncOptions {
  readonly config: ValidatedConfig;
  /** Directory containing `agentsmesh.yaml` (used to resolve relative extends). */
  readonly configDir: string;
  /** Directory containing `.agentsmesh/.lock` and canonical files. */
  readonly canonicalDir: string;
  /**
   * Project root the generated outputs are relative to. When absent, output
   * verification is skipped (keeps the programmatic API backward compatible).
   */
  readonly rootBase?: string;
  /** Output-layout scope used when scanning managed locations for stale files. */
  readonly scope?: TargetLayoutScope;
}
