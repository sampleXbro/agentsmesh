/**
 * Reference rewriting for generated outputs — **project and global scope share one pipeline**.
 *
 * **Engine (single implementation):** {@link rewriteFileLinks} chooses the shortest validated
 * relative link via `pickShortestValidatedFormattedLink` / `formatLinkPathForDestination`
 * (`link-rebaser.ts`, `link-rebaser-output.ts`). There is no separate global rewriter.
 *
 * **What scope changes:** only the canonical→output **path maps** — `buildReferenceMap`,
 * `buildOutputSourceMap`, and `buildArtifactPathMap` (see `map.ts`, `output-source-map.ts`).
 * Those maps encode where each tool writes files under project vs `~` global layouts.
 *
 * **Exception:** In global mode, outputs under `.agents/skills/` use Codex’s artifact map
 * (`artifactMapTargetForResult`) so relative links match the shared Codex global skill directory;
 * everything else uses the result’s target map as usual.
 *
 * **Link rebasing:** In project scope, {@link rewriteFileLinks} uses `.agentsmesh`-aware rules
 * (file-relative inside mesh, mesh-root paths for directories, project-root-relative outside mesh).
 * In global scope, links that resolve outside `.agentsmesh/` are left unchanged.
 *
 * Import uses the same {@link rewriteFileLinks} engine with paths from `import-map` builders
 * instead of generate-time maps.
 */
import { existsSync, statSync } from 'node:fs';
import type { CanonicalFiles, GenerateResult } from '../types.js';
import { pathApi } from '../path-helpers.js';
import type { ValidatedConfig } from '../../config/core/schema.js';
import { rewriteFileLinks } from './link-rebaser.js';
import { buildArtifactPathMap, buildOutputSourceMap } from './output-source-map.js';
import type { TargetLayoutScope } from '../../targets/catalog/target-descriptor.js';
import { getTargetLayout } from '../../targets/catalog/builtin-targets.js';
import { getDescriptor } from '../../targets/catalog/registry.js';
import { resolveRewriteFamilyId } from '../../targets/catalog/layout-outputs.js';
import { ownerTargetIdForSharedPath } from '../../targets/catalog/shared-artifact-owner.js';

/**
 * Find the owner of a shared artifact path from active targets.
 * Returns the target ID that owns the path, or null if no owner is found.
 */
function findSharedArtifactOwner(
  path: string,
  activeTargets: readonly string[] | undefined,
): string | null {
  if (!activeTargets) return null;

  for (const targetId of activeTargets) {
    const descriptor = getDescriptor(targetId);
    if (!descriptor?.sharedArtifacts) continue;

    for (const [pathPrefix, role] of Object.entries(descriptor.sharedArtifacts)) {
      if (role === 'owner' && path.startsWith(pathPrefix)) {
        return targetId;
      }
    }
  }
  return null;
}

/**
 * Any result placed under a shared artifact path in global mode must use the owner's artifact map.
 * Falls back to codex-cli for `.agents/skills/` for backward compatibility.
 */
function artifactMapTargetForResult(
  result: GenerateResult,
  scope: TargetLayoutScope,
  activeTargets: readonly string[] | undefined,
): string {
  if (scope === 'global') {
    const owner = findSharedArtifactOwner(result.path, activeTargets);
    if (owner) return owner;
    const catalogOwner = ownerTargetIdForSharedPath(result.path);
    if (catalogOwner) return catalogOwner;
  }
  return result.target;
}

function sourceMapCacheKey(target: string, activeTargets: readonly string[] | undefined): string {
  return `${target}\0${(activeTargets ?? []).join(',')}`;
}

/** Paths that will exist after this generate run (outputs plus ancestor dirs). */
export function collectPlannedPaths(projectRoot: string, results: GenerateResult[]): Set<string> {
  // Match the link rebaser: pick the path API from the projectRoot format so
  // that synthetic POSIX projectRoots in unit tests, and Windows-native
  // projectRoots in real runs, both produce keys that match the validator's
  // candidate lookups.
  const api = pathApi(projectRoot);
  const planned = new Set<string>();
  for (const result of results) {
    const absolutePath = api.join(projectRoot, result.path);
    planned.add(absolutePath);
    let current = api.dirname(absolutePath);
    while (current.startsWith(projectRoot) && !planned.has(current)) {
      planned.add(current);
      if (current === projectRoot) break;
      current = api.dirname(current);
    }
  }
  return planned;
}

function artifactCacheKey(
  result: GenerateResult,
  scope: TargetLayoutScope,
  activeTargets: readonly string[] | undefined,
): string {
  const layout = getTargetLayout(result.target, scope);
  const familyId = resolveRewriteFamilyId(layout, result.path);
  if (familyId !== 'default') {
    return `${result.target}:${familyId}`;
  }
  const via = artifactMapTargetForResult(result, scope, activeTargets);
  return via === result.target ? result.target : `${result.target}~via~${via}`;
}

export function rewriteGeneratedReferences(
  results: GenerateResult[],
  canonical: CanonicalFiles,
  config: ValidatedConfig,
  projectRoot: string,
  scope: TargetLayoutScope = 'project',
  activeTargets?: readonly string[],
  skipPaths?: ReadonlySet<string>,
): GenerateResult[] {
  const plannedPaths = collectPlannedPaths(projectRoot, results);
  const artifactCache = new Map<string, Map<string, string>>();
  const sourceCache = new Map<string, Map<string, string>>();

  return results.map((result) => {
    const smKey = sourceMapCacheKey(result.target, activeTargets);
    const sourceMap =
      sourceCache.get(smKey) ??
      (() => {
        const built = buildOutputSourceMap(result.target, canonical, config, scope, activeTargets);
        sourceCache.set(smKey, built);
        return built;
      })();
    const sourceFile = sourceMap.get(result.path);
    if (!sourceFile) return result;

    // A root file two targets share keeps canonical references, so its copies
    // stay identical and merge. Its relative links are still rebased onto the
    // canonical file they name; left as-is they point nowhere (#139).
    const shared = skipPaths?.has(result.path) === true;
    const artifactMapTarget = artifactMapTargetForResult(result, scope, activeTargets);
    const cacheKey = artifactCacheKey(result, scope, activeTargets);
    const artifactMap = shared
      ? new Map<string, string>()
      : (artifactCache.get(cacheKey) ??
        (() => {
          const built = buildArtifactPathMap(
            artifactMapTarget,
            canonical,
            config,
            projectRoot,
            result.path,
            { scope },
          );
          artifactCache.set(cacheKey, built);
          return built;
        })());
    const rewritten = rewriteFileLinks({
      content: result.content,
      projectRoot,
      sourceFile,
      destinationFile: pathApi(projectRoot).join(projectRoot, result.path),
      translatePath: (absolutePath) => artifactMap.get(absolutePath) ?? absolutePath,
      pathExists: (absolutePath) => plannedPaths.has(absolutePath) || existsSync(absolutePath),
      explicitCurrentDirLinks: true,
      rewriteBarePathTokens: !shared,
      scope,
      pathIsDirectory: (absolutePath) => {
        try {
          return statSync(absolutePath).isDirectory();
        } catch {
          return false;
        }
      },
    });

    return rewritten.content === result.content
      ? result
      : { ...result, content: rewritten.content };
  });
}
