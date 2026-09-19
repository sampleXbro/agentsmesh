/**
 * Self-describing target descriptor interface.
 *
 * A new target exports one TargetDescriptor from its index.ts.
 * The catalog imports it and adds it to BUILTIN_TARGETS — that
 * is the only central registration step.
 *
 * Designed for future plugin support: plugins will export a
 * TargetDescriptor that gets registered at runtime.
 */

import type {
  CanonicalFiles,
  CanonicalRule,
  GenerateResult,
  LintDiagnostic,
} from '../../core/types.js';
import type { ExtendPick, ValidatedConfig } from '../../config/core/schema.js';
import type { TargetCapabilities, TargetGenerators } from './target.interface.js';
import type { TargetImporterDescriptor } from './import-descriptor.js';

/** Declared output families for reference rewriting and decoration (architecture P1-3). */
export interface TargetOutputFamily {
  readonly id: string;
  readonly kind: 'primary' | 'mirror' | 'additional';
  /** Match generated paths under this prefix (e.g. Copilot `.github/instructions/`). */
  readonly pathPrefix?: string;
  /** Explicit paths for additional root mirrors (Cursor, Gemini compat). */
  readonly explicitPaths?: readonly string[];
}

export interface ExtraRuleOutputContext {
  readonly refs: ReadonlyMap<string, string>;
  readonly scope: TargetLayoutScope;
}

export type ExtraRuleOutputResolver = (
  rule: CanonicalFiles['rules'][number],
  context: ExtraRuleOutputContext,
) => readonly string[];

/**
 * Path resolvers for the output reference map.
 * Each method returns a relative output path, or null to skip.
 *
 * Shared pre-checks (root rule handling, target filtering) remain
 * centralized in map-targets.ts — descriptors only handle the
 * target-specific path logic after those guards pass.
 */
export interface TargetPathResolvers {
  /**
   * Output path for a non-root, non-filtered rule, or `null` to suppress
   * generation. Targets whose capability `rules === 'none'` for a given
   * scope MUST return `null` so callers can drop the row rather than emit
   * to a fabricated directory path.
   */
  rulePath(slug: string, rule: CanonicalRule): string | null;
  /** Output path for a command. Null suppresses generation. */
  commandPath(name: string, config: ValidatedConfig): string | null;
  /** Output path for an agent. Null suppresses generation. */
  agentPath(name: string, config: ValidatedConfig): string | null;
}

export interface TargetManagedOutputs {
  /** Directories agentsmesh fills alone; every file inside is deletable. */
  dirs: readonly string[];
  /**
   * Files agentsmesh owns outright. A run that stops emitting one DELETES it,
   * which is how revocation works.
   */
  files: readonly string[];
  /**
   * Files agentsmesh writes into but the user owns too (a shared tool config
   * holding their model, auth or editor settings). NEVER deleted: a run that
   * stops emitting one just leaves it alone, and the descriptor's
   * `mergeGeneratedOutputContent` hook keeps the user's content on the runs
   * that do write it. A path belongs to exactly one of the two lists.
   */
  coOwnedFiles?: readonly string[];
  /**
   * Alternate instruction locations the primary root replaces (a pre-migration
   * `.claude/CLAUDE.md`, a nested `.kimi-code/AGENTS.md`). Evicted whenever a
   * run emits the primary root instruction, even without lock provenance, so
   * the tool never loads the same rules twice. Left alone otherwise.
   */
  supersededFiles?: readonly string[];
}

export interface TargetLayout {
  /** Primary root instruction artifact for this scope, if any. */
  readonly rootInstructionPath?: string;
  /** Output families for rewrite cache keys and root decoration (see `layout-outputs.ts`). */
  readonly outputFamilies?: readonly TargetOutputFamily[];
  /** Additional generated rule paths that share source ownership for reference rewriting. */
  readonly extraRuleOutputPaths?: ExtraRuleOutputResolver;
  /** Optional renderer for scope-specific primary root instruction content. */
  readonly renderPrimaryRootInstruction?: (canonical: CanonicalFiles) => string;
  /** Target-native skills directory for this scope, if any. */
  readonly skillDir?: string;
  /** Files/directories agentsmesh fully manages for stale cleanup. */
  readonly managedOutputs?: TargetManagedOutputs;
  /** Optional path rewriter for scope-specific generated outputs. Return null to skip emission. */
  readonly rewriteGeneratedPath?: (path: string) => string | null;
  /**
   * Optional mirror hook. Called after rewriteGeneratedPath resolves the primary path.
   * Returns an additional path to emit the same content to, or null to skip mirroring.
   */
  readonly mirrorGlobalPath?: (
    path: string,
    activeTargets: readonly string[],
  ) => string | readonly string[] | null;
  /** Path resolvers for this scope. */
  readonly paths: TargetPathResolvers;
}

export type TargetLayoutScope = 'project' | 'global';

/** Scope extras hook (e.g. Claude Code global output-styles). */
export type ScopeExtrasFn = (
  canonical: CanonicalFiles,
  projectRoot: string,
  scope: TargetLayoutScope,
  enabledFeatures: ReadonlySet<string>,
) => Promise<GenerateResult[]>;

/** Emitter for one global-only surface, run only when scope is `global`. */
export type GlobalEmitter = (
  canonical: CanonicalFiles,
  projectRoot: string,
  enabledFeatures: ReadonlySet<string>,
) => Promise<GenerateResult[]>;

/**
 * Build a `scopeExtras` that runs `emitters` only in global scope. Targets whose
 * extra surfaces have no project-tier equivalent gate the scope here, once, so
 * no emitter can leak into project scope.
 */
export function globalOnly(...emitters: readonly GlobalEmitter[]): ScopeExtrasFn {
  return async (canonical, projectRoot, scope, enabledFeatures) => {
    if (scope !== 'global') return [];
    const results: GenerateResult[] = [];
    for (const emit of emitters) {
      results.push(...(await emit(canonical, projectRoot, enabledFeatures)));
    }
    return results;
  };
}

/** Single block for global-mode support (replaces scattered global* fields). */
export interface GlobalTargetSupport {
  readonly capabilities: TargetCapabilities;
  readonly detectionPaths: readonly string[];
  readonly layout: TargetLayout;
  readonly scopeExtras?: ScopeExtrasFn;
}

/** Import-path builder: populates refs with (target path -> canonical path) mappings. */
export type ImportPathBuilder = (
  refs: Map<string, string>,
  projectRoot: string,
  scope?: TargetLayoutScope,
) => Promise<void>;

/** Rule linter function signature. */
export type RuleLinter = (
  canonical: CanonicalFiles,
  projectRoot: string,
  projectFiles: string[],
  options?: { scope?: TargetLayoutScope },
) => LintDiagnostic[];

/** Feature-specific lint hook signature. */
export type FeatureLinter = (canonical: CanonicalFiles, options?: unknown) => LintDiagnostic[];

export type GeneratedOutputMerger = (
  existing: string | null,
  pending: GenerateResult | undefined,
  newContent: string,
  resolvedPath: string,
) => string | null;

/**
 * Chain key-scoped mergers: the first that claims `resolvedPath` wins, else the
 * output falls through to the default whole-file policy. Every multi-file target
 * composes its mergers this way.
 */
export function firstMerger(mergers: readonly GeneratedOutputMerger[]): GeneratedOutputMerger {
  return (existing, pending, newContent, resolvedPath) => {
    for (const merge of mergers) {
      const merged = merge(existing, pending, newContent, resolvedPath);
      if (merged !== null && merged !== undefined) return merged;
    }
    return null;
  };
}

/** Optional per-feature lint hooks for target-specific validation. */
export interface TargetLintHooks {
  readonly commands?: FeatureLinter;
  readonly mcp?: FeatureLinter;
  readonly permissions?: FeatureLinter;
  readonly hooks?: FeatureLinter;
  readonly ignore?: FeatureLinter;
  readonly settings?: FeatureLinter;
}

/** High-level category for grouping/filtering in docs and UI. */
export type TargetCategory = 'cli' | 'ide' | 'agent-platform';

/**
 * User-facing metadata for a target. Drives display names, docs, and links in
 * README/website, replacing hardcoded enumerations.
 */
export interface TargetMetadata {
  /** Human-readable display name, e.g. "Claude Code". */
  readonly displayName: string;
  /** High-level category for filtering. */
  readonly category: TargetCategory;
  /** Official tool homepage or canonical documentation URL. */
  readonly officialUrl: string;
  /** One-line description used in tool lists and tables. */
  readonly shortDescription: string;
}

/**
 * How a native-install pick rule derives canonical entity names from the files
 * found under its directory.
 * - `basename`: recursively collect files ending in `suffix`; name = basename
 *   minus `suffix` (e.g. `.md`, `.mdc`).
 * - `skillDir`: skill tree — `{name}/SKILL.md` plus flat top-level `*.md`.
 * - `firstSegment`: the single segment after the rule prefix is the name
 *   (e.g. `.claude/skills/{name}/...`).
 */
export type NativePickStrategy =
  | { readonly kind: 'basename'; readonly suffix: string }
  | { readonly kind: 'skillDir' }
  | { readonly kind: 'firstSegment' };

/** Maps a native directory prefix to a canonical feature + name strategy. */
export interface NativePickRule {
  /** POSIX path prefix under the repo root; matches the dir or any subpath. */
  readonly prefix: string;
  /** Canonical feature the matched files contribute to. */
  readonly feature: 'commands' | 'rules' | 'agents' | 'skills';
  /** How to derive entity names from the matched directory. */
  readonly strategy: NativePickStrategy;
}

/** Frontmatter-dialect hint for `.mdc` flat-file target inference. */
export interface NativeDialectHint {
  /** Frontmatter key whose presence identifies this target. */
  readonly frontmatterKey: string;
}

/**
 * Descriptor-driven data for the install subsystem's native-path inference.
 * Replaces the per-target `if (target === '…')` ladders (arch §3.1): each
 * target declares its own pick paths / dialect hints instead.
 */
export interface NativeInstallSupport {
  /** Ordered pick-path rules; the first matching prefix wins. */
  readonly pickPaths?: readonly NativePickRule[];
  /**
   * Escape hatch for irreducibly custom inference (e.g. Gemini's `:`-namespaced
   * command names, Copilot's overlapping `.github/*` dirs). When present it
   * fully owns inference for this target and `pickPaths` is ignored.
   */
  readonly inferPick?: (repoRoot: string, posixPath: string) => Promise<ExtendPick>;
  /** Frontmatter-dialect hints for `.mdc` flat-file target inference. */
  readonly dialectHints?: readonly NativeDialectHint[];
}

/**
 * Full self-describing target descriptor.
 * Bundles everything needed to generate, import, lint, and detect a target.
 */
export interface TargetDescriptor {
  /**
   * Unique target identifier, e.g. 'claude-code'. The `string & {}` widening
   * keeps plugin ids assignable while still letting `BuiltinTargetId` literal
   * checks (`if (id === 'claude-code')`) get autocomplete + typo protection
   * in editor tooling. Runtime validation lives in
   * `target-descriptor.schema.ts` (`/^[a-z][a-z0-9-]*$/`).
   */
  readonly id: import('./target-ids.js').BuiltinTargetId | (string & {});
  /** User-facing metadata (display name, category, URL, description) */
  readonly metadata: TargetMetadata;
  /** Feature generators (rules, commands, agents, etc.) */
  readonly generators: TargetGenerators;
  /** Feature support levels */
  readonly capabilities: TargetCapabilities;
  /** Consolidated global-mode metadata. */
  readonly globalSupport?: GlobalTargetSupport;
  /** Message shown when import finds nothing for this target */
  readonly emptyImportMessage: string;
  /** Optional linter for canonical files */
  readonly lintRules: RuleLinter | null;
  /** Optional per-feature lint hooks */
  readonly lint?: TargetLintHooks;
  /** Project-scope target layout metadata */
  readonly project: TargetLayout;
  /**
   * Declares which embedded-capability features support user-configured conversion.
   * When the corresponding conversion is disabled in config, the feature generator is skipped.
   */
  readonly supportsConversion?: { readonly commands?: true; readonly agents?: true };
  /**
   * Optional descriptor-driven importer block. When present, the shared
   * `runDescriptorImport` orchestrator handles scan + map for each declared
   * feature (with scope variance expressed as data, eliminating
   * `if (scope === 'global')` branches in importer bodies). Targets with
   * irreducibly custom parsing keep `generators.importFrom` and may delegate
   * declarable parts of their flow to the runner.
   */
  readonly importer?: TargetImporterDescriptor;
  /** Import reference map builder */
  readonly buildImportPaths: ImportPathBuilder;
  /** Filesystem paths used to detect this target during `init` */
  readonly detectionPaths: readonly string[];
  /**
   * Declares which shared artifact paths this target owns or consumes.
   * Used by the reference rewriter to select the correct artifact map for shared outputs.
   * Example: codex-cli owns '.agents/skills/', copilot consumes it in global mode.
   */
  readonly sharedArtifacts?: { readonly [pathPrefix: string]: 'owner' | 'consumer' };
  /**
   * Descriptor-driven native-install inference data (extends.pick from native
   * files, `.mdc` dialect hints). Consumed by `src/install/native` and
   * `src/install/manual` so those modules carry no target-id literals.
   */
  readonly nativeInstall?: NativeInstallSupport;
  /**
   * Optional native settings sidecar (e.g. Gemini `.gemini/settings.json` when embedded features are on).
   *
   * `enabledFeatures` is the active feature set for this generate run. Emitters
   * MUST gate every settings key on its corresponding feature (mcpServers ->
   * `mcp`, hooks -> `hooks`, agents -> `agents`, permissions -> `permissions`,
   * ignore-derived keys -> `ignore`) so a disabled feature never leaks into the
   * sidecar.
   */
  readonly emitScopedSettings?: (
    canonical: CanonicalFiles,
    scope: TargetLayoutScope,
    enabledFeatures: ReadonlySet<string>,
  ) => readonly { readonly path: string; readonly content: string }[];
  /** Optional target-specific merge strategy for generated outputs. */
  readonly mergeGeneratedOutputContent?: GeneratedOutputMerger;
  /**
   * Async post-pass for hook generator outputs (e.g. Copilot hook script assets under `.github/hooks/`).
   */
  readonly postProcessHookOutputs?: (
    projectRoot: string,
    canonical: CanonicalFiles,
    outputs: readonly { readonly path: string; readonly content: string }[],
  ) => Promise<readonly { readonly path: string; readonly content: string }[]>;
  /**
   * When true, the target preserves manual-only activation semantics (e.g.
   * Cursor's `alwaysApply: false` without globs/description). Targets without
   * this flag get a lint warning when canonical rules have `trigger: 'manual'`.
   */
  readonly preservesManualActivation?: boolean;
  /**
   * When true, `agentsmesh init` excludes this target from the default bulk
   * starter scaffold. Used by codex-cli because its `AGENTS.md` index format
   * collides with other AGENTS.md-first targets when multiple targets are
   * scaffolded together. Explicit `--target codex-cli` still works.
   */
  readonly excludeFromStarterInit?: boolean;
  /**
   * When true, this target is part of the minimal set `agentsmesh init` enables
   * when it finds no evidence of any tool — neither config in the project nor
   * an install on the machine. Keep this list very small: it is the footprint a
   * brand-new project gets by default, and `--all-targets` remains one flag
   * away. A target opts in on its own descriptor so the set stays descriptor-
   * driven rather than a hardcoded list in the CLI.
   */
  readonly minimalInitDefault?: boolean;
  /**
   * Built-in default values for `commands_to_skills` / `agents_to_skills`
   * conversion projections. A `true` value enables conversion by default; an
   * explicit `false` disables it (still consults the user's per-target config
   * override before honoring this default). When the field is `undefined`,
   * `shouldConvert{Commands,Agents}ToSkills` falls back to the caller-supplied
   * `defaultEnabled` argument (used by plugin targets that haven't declared
   * a default).
   */
  readonly conversionDefaults?: {
    readonly commandsToSkills?: boolean;
    readonly agentsToSkills?: boolean;
  };
}
