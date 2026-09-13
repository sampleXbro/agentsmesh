import { normalizeTextPayload } from '../../utils/filesystem/fs-text-encoding.js';
import type { GenerateResult } from '../types.js';
import {
  mergedEmbeddedRulesResult,
  richerAgentsResult,
  richerCodexAgentsResult,
} from './collision-agents.js';

function statusRank(status: GenerateResult['status']): number {
  switch (status) {
    case 'created':
      return 3;
    case 'updated':
      return 2;
    case 'unchanged':
      return 1;
    case 'skipped':
      return 0;
  }
}

function mergeDuplicateMetadata(preferred: GenerateResult, other: GenerateResult): GenerateResult {
  if (statusRank(other.status) <= statusRank(preferred.status)) return preferred;
  return {
    ...preferred,
    status: other.status,
    currentContent: other.currentContent ?? preferred.currentContent,
  };
}

/**
 * Resolve duplicate generated outputs that target the same path.
 * Identical content is deduplicated; conflicting content throws.
 *
 * @param results - Raw generated outputs collected per target/feature
 * @returns Deduplicated results preserving first-seen order
 */
export function resolveOutputCollisions(results: GenerateResult[]): GenerateResult[] {
  const deduped: GenerateResult[] = [];

  for (const result of results) {
    const existingIdx = deduped.findIndex((entry) => entry.path === result.path);
    if (existingIdx === -1) {
      deduped.push(result);
      continue;
    }

    const existing = deduped[existingIdx]!;
    if (existing.content !== result.content) {
      const richer = richerAgentsResult(existing, result);
      if (richer) {
        deduped[existingIdx] = richer;
        continue;
      }
      const mergedRules = mergedEmbeddedRulesResult(existing, result);
      if (mergedRules) {
        deduped[existingIdx] = refreshResultStatus(mergedRules);
        continue;
      }
      const richerCodex = richerCodexAgentsResult(existing, result);
      if (richerCodex) {
        deduped[existingIdx] = richerCodex;
        continue;
      }
      throw new Error(
        `Conflicting generated outputs for ${result.path}: ${existing.target} and ${result.target} produce different content.`,
      );
    }

    deduped[existingIdx] = mergeDuplicateMetadata(existing, result);
  }

  assertNoCaseOnlyPathCollisions(deduped);
  return deduped;
}

/**
 * After exact-path dedup, two *distinct* output paths that differ only by case
 * (e.g. `commands/Build.md` and `commands/build.md`) still resolve to the same
 * file on case-insensitive filesystems (Windows/macOS), where the second write
 * silently clobbers the first. Surface it as a hard error instead.
 */
function assertNoCaseOnlyPathCollisions(results: readonly GenerateResult[]): void {
  const byLower = new Map<string, GenerateResult>();
  for (const result of results) {
    const key = result.path.toLowerCase();
    const prior = byLower.get(key);
    if (prior !== undefined && prior.path !== result.path) {
      throw new Error(
        `Case-only path collision: "${prior.path}" (${prior.target}) and "${result.path}" (${result.target}) resolve to the same file on case-insensitive filesystems (Windows/macOS). Rename one canonical source.`,
      );
    }
    byLower.set(key, result);
  }
}

export function refreshResultStatus(result: GenerateResult): GenerateResult {
  const status =
    result.currentContent === undefined
      ? 'created'
      : normalizeTextPayload(result.path, result.currentContent) !==
          normalizeTextPayload(result.path, result.content)
        ? 'updated'
        : 'unchanged';

  return result.status === status ? result : { ...result, status };
}
