/**
 * Bridge from a recorded install manifest entry back into the install
 * pipeline, with `forceFreshMaterialize: true` for the first recorded path.
 * Used by `applySinglePack`.
 *
 * Uses the `replay` arg of runInstall to skip lock re-acquisition (refresh's
 * orchestrator already holds the .install.lock). The replay scope carries
 * the entry's recorded features/pick so install honors the same selection.
 */

import { runInstall } from '../run/run-install.js';
import type { InstallManifestEntry } from '../core/install-manifest.js';
import { replayPaths, type InstallReplayScope } from '../run/install-replay.js';
import { parseSourceUrl } from '../source/parse-source-url.js';

export interface RunInstallForRefreshArgs {
  readonly projectRoot: string;
  readonly scope: 'project' | 'global';
}

/**
 * Build a source URL pinned to `newSha` for re-installation during refresh.
 *
 * Strategy: parse the entry's recorded source to extract the base remote URL,
 * then reconstruct the source string with `newSha` as the ref. This avoids a
 * redundant network round-trip to re-resolve the ref, and ensures the install
 * pipeline fetches exactly the commit the refresh planner resolved.
 *
 * Falls back to `entry.source` unchanged if the source cannot be parsed
 * (e.g. unexpected format). In that case the install will re-use the old SHA
 * and produce a no-op, but will not crash.
 */
function buildSourceForRefresh(entry: InstallManifestEntry, newSha: string): string {
  const parsed = parseSourceUrl(entry.source);
  if (parsed === null || parsed.remoteUrl === undefined) return entry.source;

  if (entry.source_kind === 'github' && entry.source.startsWith('github:')) {
    const colonIdx = entry.source.indexOf(':');
    const atIdx = entry.source.lastIndexOf('@');
    const base = atIdx > colonIdx ? entry.source.slice(0, atIdx) : entry.source;
    return `${base}@${newSha}`;
  }

  if (entry.source_kind === 'gitlab' && entry.source.startsWith('gitlab:')) {
    const colonIdx = entry.source.indexOf(':');
    const atIdx = entry.source.lastIndexOf('@');
    const base = atIdx > colonIdx ? entry.source.slice(0, atIdx) : entry.source;
    return `${base}@${newSha}`;
  }

  if (entry.source.startsWith('git+')) {
    const hashIdx = entry.source.lastIndexOf('#');
    const base = hashIdx < 0 ? entry.source : entry.source.slice(0, hashIdx);
    return `${base}#${newSha}`;
  }

  return entry.source;
}

function refreshFlags(
  entry: InstallManifestEntry,
  scope: RunInstallForRefreshArgs['scope'],
  path: string | undefined,
  fresh: boolean,
): Record<string, string | boolean> {
  const flags: Record<string, string | boolean> = { force: true, name: entry.name };
  if (fresh) flags.forceFreshMaterialize = true;
  if (scope === 'global') flags.global = true;
  if (entry.target !== undefined) flags.target = entry.target;
  if (entry.as !== undefined) flags.as = entry.as;
  if (path !== undefined) flags.path = path;
  return flags;
}

export function createRunInstallForRefresh(args: RunInstallForRefreshArgs) {
  return async (entry: InstallManifestEntry, newSha: string): Promise<void> => {
    const replay: InstallReplayScope = {
      features: entry.features,
      pick: entry.pick,
      // Preserve the original branch/tag pin so the re-install (pinned at the
      // new SHA) does not freeze `original_ref` into that SHA — which would
      // make every subsequent refresh a no-op "unchanged".
      ...(entry.original_ref !== undefined ? { originalRef: entry.original_ref } : {}),
      // Re-apply the user's prior elevated-artifact consent so the refresh
      // keeps the accepted hooks/permissions/mcp instead of stripping them.
      ...(entry.accepted_elevated !== undefined
        ? { acceptedElevated: entry.accepted_elevated }
        : {}),
    };

    const sourceForRefresh = buildSourceForRefresh(entry, newSha);
    // A marketplace pack holds one sub-pack per recorded path: the first
    // rebuilds the pack, the rest merge into it under the same name.
    for (const [index, path] of replayPaths(entry).entries()) {
      const flags = refreshFlags(entry, args.scope, path, index === 0);
      const result = await runInstall(flags, [sourceForRefresh], args.projectRoot, replay);
      if (result.exitCode !== 0) {
        throw new Error(
          `Install for refresh "${entry.name}" failed with exit code ${result.exitCode}`,
        );
      }
    }
  };
}
