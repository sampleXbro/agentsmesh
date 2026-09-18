/**
 * Read entities (rules / commands / agents) from a tool-native directory
 * using THAT target's importer mapper, so non-Markdown formats parse into
 * canonical entities instead of being silently dropped.
 *
 * Single source of truth: each target descriptor's `importer.<kind>` spec
 * declares which extensions it claims and how to map them. Every
 * install-time directory read for the three directory-based entity kinds
 * (`rules`, `commands`, `agents`) routes through `readEntityDirWithMappers`,
 * so adding a new target — built-in OR runtime-registered plugin — with a
 * non-`.md` format is a one-place change in that target's descriptor.
 *
 * Skills (directory-based, `SKILL.md` is the file format) and singleton
 * files (mcp/hooks/permissions/ignore — fixed canonical filenames) don't
 * need this seam: their format isn't directory-walked here.
 *
 * Implementation: stage each mapper's canonical-`.md` output into a temp
 * dir, then read it back through the canonical parser. That keeps the
 * canonical parser's collision detection, frontmatter handling, and name
 * validation in one place — never reimplemented per-target.
 */

import { basename, dirname, join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
import { parseAgents } from '../../canonical/features/agents.js';
import { parseCommands } from '../../canonical/features/commands.js';
import { parseRules, type ParseFrontmatterOptions } from '../../canonical/features/rules.js';
import {
  mkdirp,
  readDirRecursiveNoSymlinks,
  readFileSafe,
  writeFileAtomic,
} from '../../utils/filesystem/fs.js';
import { getAllRegisteredDescriptorIds, getDescriptor } from '../../targets/catalog/registry.js';
import type { CanonicalAgent, CanonicalCommand, CanonicalRule } from '../../core/types.js';
import type {
  ImportFeatureSpec,
  TargetImporterDescriptor,
} from '../../targets/catalog/import-descriptor.js';
import { isBoilerplate } from './boilerplate-filter.js';
import { importAgents, importCommands, importRules } from './entity-importers.js';

/**
 * Three directory-walked entity kinds whose canonical parser is `.md`-only,
 * so any target shipping a non-`.md` mapper for that kind needs the
 * delegation seam.
 */
export type DirectoryEntityKind = 'rules' | 'commands' | 'agents';

type CanonicalEntityByKind = {
  rules: CanonicalRule;
  commands: CanonicalCommand;
  agents: CanonicalAgent;
};

/**
 * Narrowed shape for a directory-mode spec WITH a mapper. `extensions`
 * defaults to `['.md']` (per `import-descriptor.ts`); `map` is required by
 * construction so downstream code never re-checks either.
 */
interface DirectoryMapperSpec {
  readonly extensions: readonly string[];
  readonly map: NonNullable<ImportFeatureSpec['map']>;
}

/**
 * Pull every directory-mode spec out of `importer.<kind>`. Rules' importer
 * may be `ImportFeatureSpec | ImportFeatureSpec[]` (Copilot, Cursor, ...);
 * commands/agents are singular. Narrowing to `DirectoryMapperSpec` here
 * lets consumers skip the `extensions ?? []` and `if (!spec.map)` guards
 * — both are statically enforced by this filter.
 */
function directorySpecsFor(
  importer: TargetImporterDescriptor | undefined,
  kind: DirectoryEntityKind,
): readonly DirectoryMapperSpec[] {
  const raw = importer?.[kind];
  if (!raw) return [];
  const specs: readonly ImportFeatureSpec[] = Array.isArray(raw) ? raw : [raw];
  const out: DirectoryMapperSpec[] = [];
  for (const s of specs) {
    // A spec without `extensions` defaults to `['.md']` per
    // import-descriptor.ts, which means it's Markdown-only and never
    // enters the non-`.md` seam. Dropping it here keeps the narrowed type
    // total (no `?? ['.md']` defensive branch downstream) without changing
    // observable behavior — every consumer of this list cares only about
    // specs that can claim a non-`.md` file.
    if (s.mode !== 'directory' || !s.map || !s.extensions) continue;
    out.push({ extensions: s.extensions, map: s.map });
  }
  return out;
}

/**
 * True when `targetId` ships its own directory-mode importer mapper for
 * `kind` **and** that mapper accepts at least one non-Markdown extension.
 * Pure-`.md` targets stay on the canonical reader: routing them through
 * the staging path would be a no-op transform that destroys upstream
 * source-path metadata (dedup logging, error messages) for no gain.
 *
 * The dispatch fires for targets like gemini-cli (TOML slash commands)
 * and cursor (`.mdc` rules) where the mapper actually produces different
 * bytes than the upstream file.
 */
/**
 * True iff `ext` belongs to the Markdown family — i.e. canonical reader can
 * handle it natively. Treats compound extensions like `.agent.md` /
 * `.workflow.md` as Markdown so they stay on the canonical path (the
 * canonical parser already reads them via `f.endsWith('.md')`). Anything
 * not ending in `.md` (e.g. `.toml`, `.mdc`, `.yaml`) is genuinely
 * non-Markdown and needs a target mapper to translate.
 */
function isMarkdownExtension(ext: string): boolean {
  return ext.toLowerCase().endsWith('.md');
}

export function hasNonMdEntityMapper(targetId: string, kind: DirectoryEntityKind): boolean {
  for (const spec of directorySpecsFor(getDescriptor(targetId)?.importer, kind)) {
    if (spec.extensions.some((ext) => !isMarkdownExtension(ext))) return true;
  }
  return false;
}

/**
 * Non-`.md` extensions that the target's importer mappers for `kind` claim.
 * Used to silence the canonical reader's "unrecognized formats" warning
 * for files a downstream mapper will pick up.
 */
export function nonMdEntityExtensions(
  targetId: string,
  kind: DirectoryEntityKind,
): ReadonlySet<string> {
  const out = new Set<string>();
  for (const spec of directorySpecsFor(getDescriptor(targetId)?.importer, kind)) {
    for (const ext of spec.extensions) {
      if (!isMarkdownExtension(ext)) out.add(ext.toLowerCase());
    }
  }
  return out;
}

/**
 * Every registered target (built-in + runtime plugin) whose importer for
 * `kind` declares a directory-mode mapper with at least one non-`.md`
 * extension. The single enumeration source-of-truth for "which targets
 * extend the install-time format set for this entity kind".
 */
function targetsWithNonMdEntityMapper(kind: DirectoryEntityKind): readonly string[] {
  return getAllRegisteredDescriptorIds().filter((id) => hasNonMdEntityMapper(id, kind));
}

/**
 * Per-kind dispatch tables. Replacing the switch lets `kind` index the
 * table directly — the exhaustiveness check happens at table construction
 * (TS errors if a kind is missing), so no unreachable defensive `throw`
 * remains for the test runner to count as an uncovered branch.
 */
const CANONICAL_PARSERS = {
  rules: parseRules,
  commands: parseCommands,
  agents: parseAgents,
} as const;

const INSTALL_IMPORTERS = {
  rules: importRules,
  commands: importCommands,
  agents: importAgents,
} as const;

/** Canonical-parser dispatch per entity kind. */
async function parseEntityDir<K extends DirectoryEntityKind>(
  kind: K,
  dir: string,
  opts: ParseFrontmatterOptions,
): Promise<readonly CanonicalEntityByKind[K][]> {
  return CANONICAL_PARSERS[kind](dir, opts) as unknown as Promise<
    readonly CanonicalEntityByKind[K][]
  >;
}

/**
 * Install-layer entity importer (with boilerplate filtering) per kind.
 * Used when reading the canonical `.md` files from the user-facing source
 * dir so README/LICENSE/... never slip through as canonical entities.
 */
async function importEntities<K extends DirectoryEntityKind>(
  kind: K,
  dir: string,
  opts: ParseFrontmatterOptions & { handledByOtherReader?: ReadonlySet<string> },
): Promise<readonly CanonicalEntityByKind[K][]> {
  return INSTALL_IMPORTERS[kind](dir, opts) as unknown as Promise<
    readonly CanonicalEntityByKind[K][]
  >;
}

interface ToolNativeEntitiesResult<K extends DirectoryEntityKind> {
  readonly entities: readonly CanonicalEntityByKind[K][];
  /**
   * Removes the temp staging directory holding the mapper's canonical
   * output. Callers MUST invoke this only after they're done reading from
   * `entities[].source` (pack materialization `copyFile`s from those paths).
   */
  readonly cleanup: () => Promise<void>;
}

/**
 * Read entities of `kind` from `srcDir` via the named target's importer
 * mapper. Internal — callers pre-filter to targets whose descriptor has a
 * non-`.md` mapper for `kind` (via `hasNonMdEntityMapper`), so the
 * descriptor/specs lookup here always returns at least one spec.
 */
async function readToolNativeEntities<K extends DirectoryEntityKind>(
  srcDir: string,
  targetId: string,
  kind: K,
  parseOpts: ParseFrontmatterOptions = {},
): Promise<ToolNativeEntitiesResult<K>> {
  const specs = directorySpecsFor(getDescriptor(targetId)?.importer, kind);

  const allFiles = await readDirRecursiveNoSymlinks(srcDir);
  // Combined non-`.md` extension set across every spec for this target+kind
  // (rules' importer can be an array — Copilot, Cursor variants). We only
  // stage files an actual mapper claims via extension; canonical `.md` keeps
  // going through the canonical reader to preserve upstream source paths.
  const nonMdExtensions = new Set<string>();
  for (const spec of specs) {
    for (const ext of spec.extensions) {
      if (!isMarkdownExtension(ext)) nonMdExtensions.add(ext.toLowerCase());
    }
  }
  const matched = allFiles.filter(
    (path) =>
      [...nonMdExtensions].some((ext) => path.toLowerCase().endsWith(ext)) &&
      !isBoilerplate(basename(path)),
  );
  if (matched.length === 0) return { entities: [], cleanup: async () => {} };

  const stageDir = await mkdtemp(join(tmpdir(), `am-tool-${kind}-${targetId}-`));
  const cleanup = async (): Promise<void> => {
    await rm(stageDir, { recursive: true, force: true });
  };
  try {
    for (const absPath of matched) {
      const content = await readFileSafe(absPath);
      if (content === null) continue;
      const relPath = relative(srcDir, absPath).replaceAll('\\', '/');
      // Try every directory-mode spec for this target+kind in order; the
      // first that returns a mapping wins. Specs that don't claim this
      // file's extension are skipped without calling their mapper.
      let mapping: { destPath: string; content: string } | null = null;
      for (const spec of specs) {
        const claimsExt = spec.extensions.some((e) =>
          absPath.toLowerCase().endsWith(e.toLowerCase()),
        );
        if (!claimsExt) continue;
        const r = await spec.map({
          absolutePath: absPath,
          relativePath: relPath,
          content,
          destDir: stageDir,
          normalizeTo: () => content,
        });
        if (r) {
          mapping = r;
          break;
        }
      }
      if (!mapping) continue;
      await mkdirp(dirname(mapping.destPath));
      await writeFileAtomic(mapping.destPath, mapping.content);
    }
    const entities = await parseEntityDir(kind, stageDir, parseOpts);
    return { entities, cleanup };
  } catch (err) {
    await cleanup();
    throw err;
  }
}

export interface ReadEntityDirOptions {
  /**
   * If set, only this target's non-`.md` mapper is consulted (alongside the
   * canonical `.md` reader). Used by per-tool dirs in the skill-pack
   * aggregator where the dir's tool is known. If unset, every registered
   * target's non-`.md` mapper is tried — used by canonical/manual install
   * paths where the dir's "tool" is ambiguous.
   */
  readonly restrictToTarget?: string;
  readonly parseOpts?: ParseFrontmatterOptions;
}

export interface ReadEntityDirResult<K extends DirectoryEntityKind> {
  readonly entities: readonly CanonicalEntityByKind[K][];
  /** Combined cleanup for every staging dir created by per-target mappers. */
  readonly cleanup: () => Promise<void>;
}

/**
 * Read entities of `kind` from a directory using:
 *   1. the canonical `.md` reader (preserves upstream `source` paths for
 *      dedup metadata and error messages);
 *   2. every applicable target's non-`.md` mapper (or just one if
 *      `restrictToTarget` is set), staged into tmpdirs.
 *
 * Canonical `.md` wins on name collision so the canonical reader's
 * upstream source path is what dedup logs / errors show.
 *
 * This is the single seam every install-time entity-directory read should
 * go through. Canonical content reads (the user's own `.agentsmesh/`)
 * keep using `parseRules` / `parseCommands` / `parseAgents` directly
 * because that content is `.md`-only by spec; routing it through here
 * would be a no-op transform that destroys upstream source-path
 * metadata for zero gain.
 */
export async function readEntityDirWithMappers<K extends DirectoryEntityKind>(
  srcDir: string,
  kind: K,
  opts: ReadEntityDirOptions = {},
): Promise<ReadEntityDirResult<K>> {
  const restrict = opts.restrictToTarget;
  const targets = restrict
    ? hasNonMdEntityMapper(restrict, kind)
      ? [restrict]
      : []
    : targetsWithNonMdEntityMapper(kind);

  // Combined non-`.md` extension set so the canonical reader's
  // "unrecognized formats" warning stays silent for files a downstream
  // mapper claims. Each `readToolNativeEntities` call also filters by its
  // target's own extensions, so we never double-stage.
  const handledExts = new Set<string>();
  for (const id of targets) {
    for (const ext of nonMdEntityExtensions(id, kind)) handledExts.add(ext);
  }

  const canonical = await importEntities(kind, srcDir, {
    ...opts.parseOpts,
    handledByOtherReader: handledExts.size > 0 ? handledExts : undefined,
  });

  const cleanups: Array<() => Promise<void>> = [];
  // Dedup by source-file slug (basename without extension). Commands and
  // agents also expose `.name`, but rules don't — `CanonicalRule` only
  // carries `source`. Using the filename stem keeps the dedup key uniform
  // across all three entity kinds and matches the slug the canonical
  // parser already derives via `basename(path, '.md')`.
  const slugOf = (e: CanonicalEntityByKind[K]): string =>
    basename((e as { source: string }).source).replace(/\.[^.]+$/, '');
  const byKey = new Map<string, CanonicalEntityByKind[K]>();
  for (const e of canonical) byKey.set(slugOf(e), e);

  for (const id of targets) {
    const staged = await readToolNativeEntities(srcDir, id, kind, opts.parseOpts ?? {});
    cleanups.push(staged.cleanup);
    for (const e of staged.entities) {
      // Canonical `.md` wins; non-`.md` mapper output only fills gaps.
      const key = slugOf(e);
      if (!byKey.has(key)) byKey.set(key, e);
    }
  }

  const entities = [...byKey.values()].sort((a, b) => slugOf(a).localeCompare(slugOf(b)));
  const cleanup = async (): Promise<void> => {
    // Best-effort: never let one staging-dir failure strand the others.
    await Promise.allSettled(cleanups.map((fn) => fn()));
  };
  return { entities, cleanup };
}
