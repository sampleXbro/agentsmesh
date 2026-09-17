/**
 * Map install pathInRepo to target hint and whether repo-root discovery +
 * pick inference applies. The `path → target` map is derived from every
 * builtin descriptor's `project.managedOutputs` (owned AND co-owned) and
 * `detectionPaths`, so adding a new target automatically extends this map.
 *
 * Only paths owned by exactly one descriptor are included. Shared markers
 * (`AGENTS.md`, `.agents/skills`, `.mcp.json`) return `undefined` from the
 * hint — the caller falls through to other resolution (explicit `--target`,
 * import-target memory, or repo-root format detection).
 */

import type { ExtendPick } from '../../config/core/schema.js';
import { BUILTIN_TARGETS } from '../../targets/catalog/builtin-targets.js';
import { managedOutputPaths } from '../../targets/catalog/managed-outputs.js';

const PATH_PREFIX_TO_TARGET: ReadonlyArray<{ prefix: string; target: string }> = (() => {
  const owners = new Map<string, Set<string>>();
  for (const descriptor of BUILTIN_TARGETS) {
    const candidates = [...managedOutputPaths(descriptor.project), ...descriptor.detectionPaths];
    for (const raw of candidates) {
      const normalized = raw.replace(/\/$/, '');
      const ownerSet = owners.get(normalized) ?? new Set<string>();
      ownerSet.add(descriptor.id);
      owners.set(normalized, ownerSet);
    }
  }
  const entries: { prefix: string; target: string }[] = [];
  for (const [prefix, ownerSet] of owners) {
    if (ownerSet.size !== 1) continue;
    const [target] = [...ownerSet];
    entries.push({ prefix, target: target! });
  }
  return entries.sort((a, b) => b.prefix.length - a.prefix.length);
})();

function norm(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

/** Best-effort target id from a native subtree path (for install path scoping). */
export function targetHintFromNativePath(pathInRepoPosix: string): string | undefined {
  const p = norm(pathInRepoPosix);
  if (!p) return undefined;
  for (const { prefix, target } of PATH_PREFIX_TO_TARGET) {
    if (p === prefix || p.startsWith(`${prefix}/`)) return target;
  }
  return undefined;
}

/** True when path is under a native layout we can narrow with inferImplicitPickFromNativePath. */
export function pathSupportsNativePick(pathInRepoPosix: string, target: string): boolean {
  const hint = targetHintFromNativePath(pathInRepoPosix);
  return hint === target;
}

export function validateTargetMatchesPath(
  explicitTarget: string | undefined,
  pathInRepoPosix: string,
): void {
  if (!explicitTarget || !pathInRepoPosix) return;
  const hint = targetHintFromNativePath(pathInRepoPosix);
  if (hint && hint !== explicitTarget) {
    throw new Error(
      `--target "${explicitTarget}" does not match the install path (native path suggests "${hint}"). ` +
        'Omit --target to auto-detect, or point at a subtree for that target.',
    );
  }
}

export function extendPickHasArrays(p: ExtendPick): boolean {
  return (
    (p.commands?.length ?? 0) +
      (p.rules?.length ?? 0) +
      (p.skills?.length ?? 0) +
      (p.agents?.length ?? 0) >
    0
  );
}
